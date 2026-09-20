# Agent Note: 窄屏侧边栏在导航时自行收起

Status: implemented

[English](2026-09-20-web-narrow-frame-sidebar-dismissal.md) | 中文

## 问题

宽度低于 1024px 时，框架把侧边栏保留为网格轨道而不是浮层：窄屏默认是 56px 的图标栏，展开它会占用对话的宽度。从该列表中选择 Session 后列表仍然打开，手机用户必须再点一次切换按钮才能看到刚选中的对话，而这次点击正好落在浏览器双击缩放的判定窗口内，两种手势因此相互竞争。列表是导航面；在它会占掉同等宽度的窄屏上，选中之后继续展开对谁都没有好处。

## 决策

侧边栏自身的手势调用 `ctx.layout.collapseSidebar()`，它只清除窄屏展开覆盖值：[`ui-workspace`](../../../../packages/client/ui-workspace/src/client/index.ts) 包装浏览器的会话打开与新建 Session 回调，[`ui-sidebar`](../../../../packages/client/ui-sidebar/src/client/index.ts) 包装外壳的新建 Session 动作。接缝是手势本身而不是 `UiWorkspaceService.replaceMain`，因此启动时恢复的 Session 或从其他位置发起的选中都会保持外壳原样。宽屏的偏好同样不受影响，桌面浏览器保留用户设定的打开状态与宽度。侧边栏列还在 [`SidebarRoot.module.css`](../../../../packages/client/ui-sidebar/src/client/SidebarRoot.module.css) 中声明 `touch-action: manipulation`，保留列表平移与双指缩放，同时把双击手势留给列内控件而不是浏览器缩放。

## 测试

`layout-store.client.spec.ts` 证明 `collapseSidebar` 清除窄屏覆盖值、保留宽度偏好，并且不改变宽屏已打开的侧边栏。`ui-workspace` 的 apply spec 通过真实 `LayoutController` 证明每个浏览器手势——两种新建 Session 分支与一次会话打开——各收起一次，`ui-sidebar` 的 apply spec 证明外壳的新建 Session 动作同样如此。`pnpm run test:gui` 覆盖侧边栏与工作区套件。

## 备选方案

- **在 viewport meta 中设置 `user-scalable=no`。** 否决：它同时剥夺对话与图表页面的双指缩放，框架没有理由这样做。
- **侧边栏内任何按下都收起。** 否决：滚动手势与行菜单也会触发收起。
- **仅在侧边栏覆盖对话时收起。** 否决：目前不存在浮层呈现；窄屏是挤压中间栏，因此这些情况下同样需要收起。
- **在 `UiWorkspaceService.replaceMain` 中收起。** 否决：启动恢复与所有非侧边栏调用都经过它，恢复的 Session 会关掉用户刚打开的侧边栏。
- **监听 Session 选择 store 而不是导航提交点。** 否决：该 store 还会发布恢复的选择与外部归档导致的选择，那些都不是用户导航。

## 后果

- 在 Session 行上点一次即切换对话并显示它。
- 窄屏用户无法不重新打开侧边栏就连续选择两个 Session。
- 桌面行为不变，包括手动切换按钮与已保存宽度。
- 侧边栏内的双击不再缩放页面；双指缩放与列表平移仍然可用。
- 规则跟随侧边栏自身的手势，因此恢复的或外部驱动的选中永远不会收起用户并未离开的侧边栏。
