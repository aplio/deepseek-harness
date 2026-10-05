# ubu01 配備（fork 専用）

この fork の Web UI を ubu01 で動かすための配備物。upstream には存在しないディレクトリなので、upstream 追従で衝突しない。

## 構成

- 編集 clone: `/home/aplio/workspace/deepseek-harness`。開発・upstream マージ専用で、本番からは一切参照しない。
- 配備ルート: `~/deploy/deepseek-harness/`
  - `mirror.git` — origin（aplio fork）と upstream を fetch する bare リポジトリ。
  - `releases/release-<rev12>-XXXXXX/` — 1 コミット = 1 リリース。mirror からの clone を `master` ブランチで checkout し、`pnpm install` と `pnpm run build` まで済ませた凍結ツリー。
  - `current` / `previous` — 稼働中と直前のリリースへの symlink。
  - `bin/release.sh` — timer 用に current からコピーされる配備スクリプト。
  - `state/` — 失敗したコミットの印（`failed-<sha>`）とビルドログ。
- `deepseek-harness.service` は `current/deploy/ubu01/dsh-web-service` を起動する。unit は `systemd/` が正本で、配備のたびに `~/.config/systemd/user/` へ同期される。

## 配備の流れ

1. 編集 clone で作業し、`master` に commit して `git push origin master`。
2. `deepseek-harness-deploy.timer`（10 分毎）が origin/master の移動を検知し、新しいリリースを別ディレクトリでビルドする。ビルド中も旧リリースが稼働し続ける。
3. ビルドが通れば `current` を切り替えて再起動し、`127.0.0.1:3081` の応答を確認する。応答しなければ `previous` に戻して再起動する。
4. 失敗したコミットは自動では再試行しない。直したコミットを push するか、手動で `release` を実行する。

## 手動操作

```sh
~/deploy/deepseek-harness/bin/release.sh status     # 稼働中リリースと origin/master
~/deploy/deepseek-harness/bin/release.sh release    # origin/master を今すぐ配備（失敗印があっても実行）
~/deploy/deepseek-harness/bin/release.sh release <rev>  # 任意のコミットを配備
~/deploy/deepseek-harness/bin/release.sh rollback   # previous に戻す
journalctl --user -u deepseek-harness-deploy -n 100  # 自動配備のログ
```

## upstream 追従

編集 clone で `git fetch upstream && git merge upstream/master`、衝突解消、`pnpm install && pnpm run build` と関連テストを通してから push する。マージ途中の作業ツリーが本番に流れることはない。
