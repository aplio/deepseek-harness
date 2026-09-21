# Agent Note: Web 侧边栏提示运行中的 checkout 是否落后于 fork 源

Status: implemented

[English](2026-09-20-web-installation-upstream-badge.md) | 中文

## 问题

人们运行 dsh 所用的 checkout 会逐渐落后于它所 fork 的源，而 GUI 对此毫无提示；想知道就只能离开 GUI 打开终端。侧边栏本来就会写出正在运行的构建——本地构建标签带着这份代码的版本与 commit——因此这条报告应当放在它所描述的事实旁边。

## 决策

[`dsh-api-workspace-git`](../../../../packages/api/workspace-git/README.zh.md) 新增了一个不带 scope 的 `upstream()` Remote 方法。它的主体是安装本身，而不是 Session 工作区：所有 Session 共享同一个正在运行的安装，因此该方法不接收 Session 标识。主体是本模块自身所在的 checkout，用与 Web bundle 解析自身前端 dist 完全相同的 `import.meta.url` 方式解析；并且仅当该目录本身就是仓库顶层目录时成立——打包安装，以及嵌套在另一个仓库中的 checkout，都回答 `none`，而不是报告陌生仓库的 remote。

读取只有一次 `git ls-remote <upstreamRemote> refs/heads/<当前分支>` 并与 HEAD 比较，这也是唯一访问网络的步骤。远端 commit 已在本地对象库中时，用 `git rev-list --count` 给出精确数字的 `behind`；不在本地时则证明存在更新但无法给出规模，因为本仓库没有的对象不可能是 HEAD 的祖先。已确定的答案在 `checkIntervalMs` 内复用，失败的检查不缓存，因此客户端可以按展示需要任意轮询，而网络读取仍保持每天一次。

[`dsh-client-ui-git-branch`](../../../../packages/client/ui-git-branch/README.zh.md) 把该答案渲染为侧边栏品牌行上的提示，扩展了本就承载 checkout 芯片的包（[Web composer git-branch chip](2026-09-15-web-composer-git-branch-chip.zh.md)）。[`ui-sidebar`](../../../../packages/client/ui-sidebar/README.zh.md) 在 `sidebar.brand.mark` 与 `sidebar.brand.name` 旁声明了 `sidebar.brand.status`；该占位者不可交互，因为品牌行本身已经是 New Session 按钮。其 controller 在页面可见时每 30 分钟轮询一次，并在页面重新可见时轮询，且只在展示出的关系——kind、仓库 slug、commit 数——变化时才发布。

## 验证

`tests/upstream.spec.ts` 覆盖 ls-remote 与 rev-list 解析器，针对真实仓库与 remote 运行 `checkUpstream`（current、能算出与算不出规模的 behind、detached HEAD、remote 被移除、remote 不携带该分支、非仓库、不可达 remote），并通过脚本化的 subprocess 面覆盖服务的间隔缓存：复用、过期后重读、失败不缓存，以及并发调用共享同一次进行中的检查。`upstream-controller.client.spec.ts` 证明轮询会发布变化后的关系、对未变化的关系保持静默、失败或无值结果后保留上一次答案、按间隔重读、在一次读取进行中跳过重复请求，并丢弃释放后才结算的读取。`upstream-badge.client.spec.tsx` 证明静默关系不渲染任何内容，以及两种 `behind` 标签会渲染各自的 commit 数。`browser-plugin.client.spec.ts` 在真实 slot registry 上证明三处席位注册及其 HMR 移除。组装客户端的默认响应表回答 `workspaceGit/upstream`，使 shell 各 spec 仍能启动。其余部分由 `pnpm run test:gui`、`pnpm run test:docs` 以及重新生成的 Cordis、config 与 client 目录覆盖。

## 考虑过的替代方案

- **把答案限定到 Session 工作区。** 否决：品牌行是 root scope，且不存在全局的当前 Session 来源；报告还会跟随正在阅读的 Session，而不是正在运行的代码。
- **新建宿主包。** 否决：该事实只是通过同一个 runner、不带 scope 的 Remote 管道与同一个客户端 namespace 读取的另一个 checkout；为单个方法再建一个包只会重复 subprocess 接线。
- **用 `git fetch` 代替 `ls-remote`。** 否决：一个定时改写 checkout refs 并下载对象的操作，对一个状态指示灯来说副作用过大；指定远端分支的代价只是在对象落到本地之前拿不到精确数字。
- **使用分支配置的上游（`@{upstream}`）。** 否决：在 fork 里那是 `origin/master`，因此会永远报告零落后——fork 源是另一个 remote。
- **替换 `sidebar.brand.name`。** 否决：该席位承载本地构建标签，接管它既要重复版本渲染，又会让部署可替换的席位消失。
- **折叠轨道上已有的 `sidebar.toggle.badge`。** 否决：该 single 席位归桌面更新提示所有，而且只在侧边栏收起时渲染。

## 影响

- 只有当安装根目录就是仓库顶层目录时提示才出现，因此打包安装不显示任何内容。
- 每个 `checkIntervalMs` 之后的第一次检查会访问网络；没有网络的宿主会回答 `unknown` 并重试，而不是把失败缓存一整个间隔。
- 默认分支名与本地分支不同的上游仓库会回答 `none`，而不是与错误的历史比较。
- 对模型可见的部分没有任何变化：不涉及 session 事件、prompt 段落、工具 schema 或 session log。
- `ui-sidebar` 多拥有一个已声明的洞，其外壳 snapshot 也多了该席位的标记。
