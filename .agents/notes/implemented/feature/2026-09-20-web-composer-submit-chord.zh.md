# Agent Note: Web composer 以 Cmd/Ctrl+Enter 提交

Status: implemented

[English](2026-09-20-web-composer-submit-chord.md) | 中文

## 问题

此前按 Enter 会提交草稿，Shift+Enter 才换行。该模型假定了拉丁键盘：日文或中文输入法结束组合的那次 Enter 走同一条 keymap 路径，多行草稿的每一次换行都要按住 Shift，而 keymap 还必须把 IME 守卫花在提交路径上。由于 Enter 是主要提交手势，忙碌状态偏好的描述也只能写成"Enter 与发送按钮"，手势一变，设置的含义就跟着变。

## 决策

普通 Enter 与 Shift+Enter 都落到编辑器原生的换行，Cmd/Ctrl+Enter 成为输入框唯一的键盘提交手势。[`registerComposerKeymap`](../../../../packages/client/ui-conversation/src/client/input/editor/keymap.ts) 保留 IME 守卫、菜单仲裁（触发器菜单打开时任何 Enter 仍选中高亮项）与重复抑制；通过这些守卫后，不带 Ctrl/Meta 的 Enter 返回 false，由 `@lexical/plain-text` 插入换行，只有组合键会到达 `handlers.submit()`。由于只有一种键盘手势会到达处理器，`ComposerKeymapHandlers.submit` 不再携带 accelerated 标志。

组合键的投递解析与主发送按钮的点击完全一致：两者都调用 `resolveSubmitMode(busyEnter, running, steeringAvailable)`，因此忙碌态设置同时约束按钮与键盘。该解析不再需要手势参数，`ComposerSubmitGesture` 也随之删除，因为只有一种手势会到达它。空草稿的组合键仍会把所有排队消息转为插话。设置行的描述现在说明按钮与组合键，而不再提 Enter（[决策](../bug-fix/2026-09-04-busy-send-button-follows-enter-setting.zh.md)）。

## 测试

`keymap-routing.client.spec.tsx` 断言普通 Enter 落到原生换行且不调用提交，两种组合键写法都以无参形式提交。`input-bar.client.spec.tsx` 覆盖组合键的 queue/steer 解析、重复抑制、纯空白拒绝、空草稿整队插话，以及组合结束与 keyCode 229 的 Enter——如今 IME 守卫保护的正是唯一的手势。`input-matrix`、`input-scenarios`、`assembly-surfaces`、`skeleton` 均通过组合键提交。`enter-behavior-row.client.spec.tsx` 与 `settings-chrome` 的 ARIA 金标准记录新文案。`pnpm run test:gui` 与无密钥的 `DSH_SNAPSHOT=replay pnpm run test:web` 通道覆盖组装后的输入框。

## 备选方案

- **为 Enter 行为增加偏好项。** 否决：运营方要求的是单一行为，输入框已有一个偏好；再加一个就得描述两种互相冲突的手势。
- **只保留 Shift+Enter 作为换行。** 否决：仍然假定拉丁键盘，并让输入法结束组合的 Enter 留在提交路径上。
- **让组合键使用与 `busyEnter` 偏好相反的模式。** 否决：该设置是用户对忙碌态投递的唯一答复，一个悄悄把它反转的键盘手势会让发送按钮与组合键对同一份草稿给出不同结果。
- **在处理器上保留 accelerated 参数。** 否决：只剩一种键盘手势时该标志恒为 true，视图绑定直接写明投递模式即可。
- **草稿没有换行时仍用普通 Enter 提交。** 否决：手势会取决于不可见的草稿内容，"Enter 通常发送、但有时不发送"比组合键更难预测。

## 后果

- 多行草稿无需修饰键，输入法结束组合的那次 Enter 永不发送。
- 从键盘发送始终需要 Cmd 或 Ctrl；此前用 Enter 发送的用户改用组合键或发送按钮。
- 忙碌状态设置同时支配两种主要提交手势：发送按钮与组合键投递同一模式，设置行也如此描述。
- 空草稿的组合键仍会整队插话，运行中的 Session 依然有从键盘刷新队列的路径。
- 无任何模型可见面变化：提示词、session 事件、工具 schema 与 KV 缓存均不受影响。
