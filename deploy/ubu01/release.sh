#!/usr/bin/env bash
# release.sh — frozen releases of the fork's Web UI on ubu01.
#
#   release.sh auto            fetch; release origin/master when it differs from the current release
#                              (a commit that already failed is skipped until it is released by hand)
#   release.sh release [REV]   fetch, then release REV (default origin/master) even if it failed before
#   release.sh rollback        switch back to the previous release and restart
#   release.sh status          current/previous releases, origin/master, service state
#   release.sh install-units   install this release's systemd units (daemon-reload, nothing restarted)
#
# Production never runs the editing clone (/home/aplio/workspace/deepseek-harness). A release is a
# separate git clone of the commit under $DSH_DEPLOY_ROOT/releases/, installed and built there, and
# deepseek-harness.service runs $DSH_DEPLOY_ROOT/current. The release is a real checkout on branch
# master with the `upstream` remote, so the sidebar badge (ui-git-branch) can still report how far
# the running build is behind deepseek-ai/deepseek-harness.
#
# Releasing: build in a new directory while the old release keeps serving -> switch `current`
# (the old one becomes `previous`) -> restart -> health check on 127.0.0.1:3081; a failed check
# switches back and restarts the previous release. `auto` runs from deepseek-harness-deploy.timer
# through $DSH_DEPLOY_ROOT/bin/release.sh, a copy refreshed from every release, and hands off to the
# target commit's own release.sh, so a deploy always uses the tooling of the commit it deploys.
#
# Env: DSH_DEPLOY_ROOT (default ~/deploy/deepseek-harness), DSH_RELEASE_KEEP (old releases kept
# besides current/previous, default 2).
set -euo pipefail

ROOT="${DSH_DEPLOY_ROOT:-$HOME/deploy/deepseek-harness}"
MIRROR="$ROOT/mirror.git"
RELEASES="$ROOT/releases"
STATE="$ROOT/state"
KEEP="${DSH_RELEASE_KEEP:-2}"
ORIGIN_URL="https://github.com/aplio/deepseek-harness.git"
UPSTREAM_URL="https://github.com/deepseek-ai/deepseek-harness.git"
BRANCH=master
SERVICE=deepseek-harness.service
HEALTH_URL="http://127.0.0.1:3081/"
NODE_BIN_DIR="/home/aplio/.nvm/versions/node/v24.13.1/bin"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

export PATH="$NODE_BIN_DIR:$PATH"

log() { echo "[$(date -Is)] $*"; }
die() { log "release.sh: $*" >&2; exit 1; }

with_lock() {
  mkdir -p "$ROOT" "$STATE"
  exec 9>"$ROOT/deploy.lock"
  flock -n 9 || { log "another deploy holds $ROOT/deploy.lock; skipping"; exit 0; }
}

ensure_mirror() {
  if [[ ! -d "$MIRROR" ]]; then
    git init -q --bare "$MIRROR"
    git -C "$MIRROR" remote add origin "$ORIGIN_URL"
    git -C "$MIRROR" remote add upstream "$UPSTREAM_URL"
    # origin's branch is the mirror's own master, so a clone of the mirror checks it out.
    git -C "$MIRROR" config remote.origin.fetch "+refs/heads/$BRANCH:refs/heads/$BRANCH"
    git -C "$MIRROR" config remote.upstream.fetch "+refs/heads/$BRANCH:refs/remotes/upstream/$BRANCH"
  fi
}

fetch() {
  ensure_mirror
  git -C "$MIRROR" fetch -q --prune origin
  # Upstream objects let the release count how far it is behind without a network fetch; a
  # failure here only weakens that badge, so it never blocks a deploy.
  git -C "$MIRROR" fetch -q --prune upstream || log "warning: fetching upstream failed"
}

current_rev() { cat "$ROOT/current/REVISION" 2>/dev/null || echo none; }

health() {
  local code=""
  for _ in $(seq 1 40); do
    sleep 3
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)"
    case "$code" in
      200|303|401)
        # A process that answered once and then died is not healthy either.
        sleep 5
        systemctl --user is-active --quiet "$SERVICE" && return 0 ;;
    esac
  done
  log "no healthy answer from $HEALTH_URL (last HTTP ${code:-none}; $SERVICE $(systemctl --user is-active "$SERVICE" || true))"
  return 1
}

switch_to() {
  # $1: release directory to make current; the old current becomes previous.
  local old
  old="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
  if [[ -n "$old" && "$old" != "$(readlink -f "$1")" ]]; then
    ln -sfn "$old" "$ROOT/previous.next"
    mv -Tf "$ROOT/previous.next" "$ROOT/previous"
  fi
  ln -sfn "$1" "$ROOT/current.next"
  mv -Tf "$ROOT/current.next" "$ROOT/current"
}

in_use() {
  local pid
  pid="$(systemctl --user show "$SERVICE" -p MainPID --value 2>/dev/null || echo 0)"
  if [[ "${pid:-0}" != 0 ]]; then readlink -f "/proc/$pid/cwd" 2>/dev/null || true; fi
}

prune() {
  local current previous used dir n=0
  current="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
  previous="$(readlink -f "$ROOT/previous" 2>/dev/null || true)"
  used="$(in_use)"
  for dir in $(ls -1dt "$RELEASES"/release-* 2>/dev/null); do
    [[ "$dir" == "$current" || "$dir" == "$previous" ]] && continue
    case "$used" in "$dir"|"$dir"/*) log "keeping $dir (the service runs from it)"; continue ;; esac
    n=$((n + 1))
    (( n <= KEEP )) && continue
    rm -rf -- "$dir"
    log "pruned $dir"
  done
}

install_units() {
  # $1: release directory whose deploy/ubu01/systemd units to install.
  local src="$1/deploy/ubu01/systemd" unit changed=no
  mkdir -p "$UNIT_DIR"
  for unit in "$src"/*; do
    if ! cmp -s "$unit" "$UNIT_DIR/$(basename "$unit")"; then
      install -m 644 "$unit" "$UNIT_DIR/$(basename "$unit")"
      log "installed $(basename "$unit")"
      changed=yes
    fi
  done
  [[ "$changed" == yes ]] && systemctl --user daemon-reload
  mkdir -p "$ROOT/bin"
  install -m 755 "$1/deploy/ubu01/release.sh" "$ROOT/bin/release.sh"
}

build_release() {
  # $1: full commit id. Prints the finished release directory on stdout.
  local full="$1" dir
  mkdir -p "$RELEASES"
  dir="$(mktemp -d "$RELEASES/release-${full:0:12}-XXXXXX")"
  chmod 755 "$dir"
  # `&&` throughout: the caller tests this function in an `if`, where errexit is off.
  if ! {
    git clone -q --local --no-checkout "$MIRROR" "$dir" \
      && git -C "$dir" checkout -q -B "$BRANCH" "$full" \
      && git -C "$dir" remote set-url origin "$ORIGIN_URL" \
      && git -C "$dir" remote add upstream "$UPSTREAM_URL" \
      && echo "$full" > "$dir/REVISION" \
      && printf "REVISION\nBUILD.log\n" >> "$dir/.git/info/exclude" \
      && (cd "$dir" && CI=1 pnpm install --frozen-lockfile && pnpm run build)
  } >"$dir.build.log" 2>&1; then
    tail -n 40 "$dir.build.log" >&2
    mv "$dir.build.log" "$STATE/build-failed-${full:0:12}.log"
    rm -rf -- "$dir"
    return 1
  fi
  mv "$dir.build.log" "$dir/BUILD.log"
  echo "$dir"
}

release() {
  local rev="${1:-origin/$BRANCH}" full dir
  [[ "$rev" == "origin/$BRANCH" ]] && rev="$BRANCH"
  full="$(git -C "$MIRROR" rev-parse --verify "$rev^{commit}")" || die "unknown revision $rev"
  log "building ${full:0:12} in $RELEASES"
  if ! dir="$(build_release "$full")"; then
    touch "$STATE/failed-$full"
    die "build of ${full:0:12} failed; $ROOT/current is unchanged"
  fi
  switch_to "$dir"
  install_units "$dir"
  log "restarting $SERVICE onto ${full:0:12}"
  systemctl --user restart "$SERVICE"
  if health; then
    rm -f "$STATE/failed-$full"
    log "released ${full:0:12} -> $ROOT/current"
    prune
    return 0
  fi
  touch "$STATE/failed-$full"
  rollback_now
  die "${full:0:12} did not come up; rolled back to $(current_rev | cut -c1-12)"
}

rollback_now() {
  local previous
  previous="$(readlink -f "$ROOT/previous" 2>/dev/null || true)"
  [[ -n "$previous" && -d "$previous" ]] || die "no previous release to roll back to"
  switch_to "$previous"
  install_units "$previous"
  systemctl --user restart "$SERVICE"
  if health; then log "rolled back to $(current_rev | cut -c1-12)"; else log "the previous release did not come up either"; return 1; fi
}

auto() {
  local target current tooling
  target="$(git -C "$MIRROR" rev-parse "$BRANCH")"
  current="$(current_rev)"
  [[ "$target" == "$current" ]] && return 0
  if [[ -e "$STATE/failed-$target" ]]; then
    log "origin/$BRANCH ${target:0:12} failed before; release it by hand: $0 release"
    return 0
  fi
  # Hand off to the target commit's own tooling (the lock is inherited through fd 9).
  tooling="$(mktemp "$STATE/release-XXXXXX.sh")"
  if git -C "$MIRROR" show "$target:deploy/ubu01/release.sh" > "$tooling" 2>/dev/null; then
    log "origin/$BRANCH moved ${current:0:12} -> ${target:0:12}"
    local status=0
    DSH_RELEASE_LOCKED=1 bash "$tooling" release "$target" || status=$?
    rm -f "$tooling"
    return "$status"
  fi
  rm -f "$tooling"
  die "${target:0:12} has no deploy/ubu01/release.sh"
}

status() {
  echo "current:  $(readlink "$ROOT/current" 2>/dev/null || echo none) ($(current_rev))"
  echo "previous: $(readlink "$ROOT/previous" 2>/dev/null || echo none)"
  [[ -d "$MIRROR" ]] && echo "origin/$BRANCH: $(git -C "$MIRROR" rev-parse "$BRANCH" 2>/dev/null || echo unknown) (as of the last fetch)"
  echo "$SERVICE: $(systemctl --user is-active "$SERVICE" || true), cwd $(in_use)"
  ls -1 "$STATE"/failed-* 2>/dev/null | sed 's#.*/failed-#failed: #' || true
}

lock() { [[ "${DSH_RELEASE_LOCKED:-0}" == 1 ]] || with_lock; }

case "${1:-}" in
  auto) lock; fetch; auto ;;
  release) lock; fetch; release "${2:-}" ;;
  rollback) lock; rollback_now ;;
  status) status ;;
  install-units) install_units "$(readlink -f "$ROOT/current")" ;;
  *) sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
