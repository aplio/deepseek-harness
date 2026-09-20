# Agent Note: The Web composer submits on Cmd/Ctrl+Enter

Status: implemented

English | [中文](2026-09-20-web-composer-submit-chord.zh.md)

## Problem

Plain Enter submitted the composer draft while Shift+Enter broke the line. That model assumes a Latin keyboard: a Japanese or Chinese IME's closing Enter lands in the same keymap path, a multi-line draft needs Shift held for every break, and the keymap has to spend its IME guard on the send path. The busy-state preference was also described as "Enter and the Send button" because Enter was the primary submission gesture, so the setting's meaning moved whenever the gesture did.

## Decision

Plain Enter and Shift+Enter fall through to the editor's native line break, and Cmd/Ctrl+Enter is the composer's only keyboard submit. [`registerComposerKeymap`](../../../../packages/client/ui-conversation/src/client/input/editor/keymap.ts) keeps its IME guard, its menu arbitration (an open trigger menu still picks the highlighted option on any Enter), and its repeat suppression; after those guards, an Enter without Ctrl or Meta returns false so `@lexical/plain-text` inserts the line break, and only the chord reaches `handlers.submit()`. `ComposerKeymapHandlers.submit` no longer carries an accelerated flag, because one keyboard gesture reaches it.

The chord resolves its delivery exactly as the primary Send button resolves a click: both call `resolveSubmitMode(busyEnter, running, steeringAvailable)`, so the busy-state setting governs the button and the keyboard alike. That resolution lost its gesture parameter, and `ComposerSubmitGesture` went with it, because one gesture was all that reached it. The empty-draft chord still steers every queued message. The Settings row's description now names the button and the chord instead of Enter ([decision](../bug-fix/2026-09-04-busy-send-button-follows-enter-setting.md)).

## Verification

`keymap-routing.client.spec.tsx` asserts that a plain Enter reaches the native line break without a submit call and that both chord spellings submit with no argument. `input-bar.client.spec.tsx` covers the chord's queue/steer resolution, repeat suppression, whitespace rejection, the empty-draft queue steer, and composition-closing plus keyCode-229 Enters on the chord, which is now the only gesture the IME guard protects. `input-matrix`, `input-scenarios`, `assembly-surfaces`, and `skeleton` submit through the chord. `enter-behavior-row.client.spec.tsx` and the `settings-chrome` ARIA goldens carry the new copy. `pnpm run test:gui` and the keyless `DSH_SNAPSHOT=replay pnpm run test:web` lane cover the assembled composer.

## Alternatives considered

- **A preference for the Enter behavior.** Rejected: the operator asked for one behavior, and the composer already has one preference; a second one would have to describe two gestures that disagree.
- **Keeping Shift+Enter as the only line break.** Rejected: it keeps the Latin-keyboard assumption and leaves the IME's closing Enter on the send path.
- **Giving the chord the opposite of the `busyEnter` preference.** Rejected: the setting is the user's one answer for busy delivery, and a keyboard gesture that silently inverts it makes the Send button and the chord disagree about the same draft.
- **Keeping the accelerated parameter on the handler.** Rejected: with one keyboard gesture the flag can only be true, and the view binding states the delivery mode directly.
- **Submitting on plain Enter while the draft holds no newline.** Rejected: the gesture would depend on invisible draft content, and "Enter sends unless it would not" is harder to predict than a chord.

## Consequences

- A multi-line draft needs no modifier, and an IME's closing Enter never sends.
- Sending from the keyboard always costs Cmd or Ctrl; a user who typed Enter to send now uses the chord or the Send button.
- The busy-state setting governs both primary submit gestures: the Send button and the chord deliver the same mode, and the Settings row now says so.
- The empty-draft chord still steers the queue, so a running Session keeps a keyboard path for flushing queued messages.
- No model-visible surface changes: no prompt, session event, tool schema, or KV-cache effect.
