---
description: "面向 Web GUI 的工作区 git 服务：通过 workspaceGit Remote namespace 提供 Session 工作区目录所在的 checkout——ref、worktree 目录与 GitHub 仓库——以及正在运行的安装是否落后于其 fork 源。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-git

[English](README.md) | 中文

## 概述

本包为 Web GUI 回答两个宿主侧问题：当前 Session 工作区位于哪个 checkout，以及正在运行的 checkout 是否落后于它所 fork 的源。`workspaceGit` Remote namespace 在不激活 Agent、不读取事件正文的前提下解析 Session header 中的目录，通过组合的 subprocess provider 运行 `git` 读取，并把结果映射为三态联合——分支名、detached HEAD 的短 commit id，或仓库之外的 `none`。找到的 checkout 还会带上 worktree 目录名，以及 `origin` 指向 github.com 时的 `owner/repo` 与 URL。两个答案都是环境信息，绝不是 Session 状态。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在携带 `sessions`、`subprocess`、`sandboxPolicy` 与 `typert` 的组合中挂载本插件，通常与其浏览器侧消费者 [`dsh-client-ui-git-branch`](../../client/ui-git-branch/README.zh.md) 一同使用。Client 调用 `remote.workspaceGit.status(sessionId, signal)` 获取某个 Session 的 checkout，调用 `remote.workspaceGit.upstream()` 获取它所连接的安装；后者不带 Session，因为所有 Session 共享同一个安装。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `timeoutMs` | 必填 | 一次 `git` 调用的截止时间（毫秒），从解析可执行文件到取得退出结果。 |
| `upstreamRemote` | 必填 | 分支代表安装 fork 源的 remote 名称。 |
| `checkIntervalMs` | 必填 | 一次已确定的安装 upstream 答案被复用的时长，之后才做下一次检查。 |

### 行为预期

一个答案可能命名已检出的分支（包括首次提交之前的未诞生分支）；可能给出 detached HEAD 的短 commit id；`none` 则对应仓库之外的目录、未安装 git 的宿主、已消失的工作区以及超时的调用。位于仓库内部的子目录会报告所属仓库。worktree 目录名取该 checkout 根目录的基本名，因此链接 worktree 报告的是 Session 实际工作的目录；没有工作树的仓库（bare repository）没有该名字。GitHub 仓库只从 `origin` 读取，且仅当该 URL 指向 github.com，因此不可达或托管在其他站点的 remote 只会让该字段为 null，ref 答案依然有效。以上都不作为错误抛出：拿不到的事实本身就是一种答案。每次调用都会依次启动 `git -C <workspaceRoot> branch --show-current`、`git rev-parse --show-toplevel` 与 `git config --get remote.origin.url`——HEAD 处于 detached 状态时再加一次 `git rev-parse --short HEAD`，仓库之外则只执行第一次读取——不做缓存，因此轮询的调用方自行决定轮询间隔。

安装侧答案是另一个主体，规则也不同。它在本包自身所在的仓库 checkout 中运行，而不是 Session 工作区，且仅当该 checkout 本身就是仓库顶层目录时才会进行；打包安装，以及嵌套在另一个仓库中的 checkout，都回答 `none`。它通过一次 `git ls-remote` 将 HEAD 与所配置 remote 的同名分支比较——这是唯一会访问网络的读取——远端 commit 已在本地对象库中时报告带 commit 数的 `behind`，不在时报告不带数字的 `behind`：本仓库没有的对象不可能是 HEAD 的祖先，因此它能证明存在更新，却无法给出规模。detached HEAD、remote 缺失、以及 remote 不携带该分支都回答 `none`；remote 不可达则回答 `unknown`，且永不缓存。关系一旦确定，会在 `checkIntervalMs` 内复用，因此调用方可以按自身展示需要任意轮询，而网络读取仍保持每天一次；并发调用方共享同一次检查。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

Session 级 lookup `workspaceGitScope` 解析 Session id 到工作区目录的方式与 `dsh-api-workspace-files` 解析 `workspaceFileScope` 完全一致：优先使用在线 header 的 `cwd`，否则读取冷 Session 的持久化 header，再否则使用 sandbox policy 的 workspace root；完全没有 header 的 Session 解析为 `undefined`，由 Gateway 报告 `gateway/lookup-not-found`。每次读取都把调用方的 signal 与部署截止时间合并后交给 spawn，因此超时会通过 subprocess provider 的常规终止流程中止受管进程范围。stdout 与 stderr 以 64 KiB 上限收集——每个答案都只有一行——非零退出、无法解析的 `git`、被拒绝的 spawn 以及超时中止都读作不可用。`branch --show-current` 一次覆盖三种 ref 情况：分支或未诞生分支给出名字，detached HEAD 给出空答案并由随后的短 id 读取补全，仓库之外则以失败告终。remote URL 按 git 保存的两种写法解析——带 scheme 的 URL（`https://`、`ssh://`、`git://`）与 scp 风格的 `[user@]host:path`——凡不是 `github.com/owner/repo` 的 URL 都不产生仓库。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当本服务自身的信息不足时，请阅读以下页面；它们从 wire 联合类型出发，走向其消费者以及它所依赖的 seam。

- [dsh-client-ui-git-branch](../../client/ui-git-branch/README.zh.md) — 轮询该 namespace 的 composer 统计行芯片。
- [dsh-api-workspace-files](../workspace-files/README.zh.md) — 本服务遵循的同门 Session 级 lookup。
- [dsh-subprocess](../../subprocess/subprocess/README.zh.md) — 负责 spawn、终止与输出收集的进程能力。
- [API Gateway](../../../docs/api-gateway.zh.md) — 生成的 Remote namespace 如何成为 Client 调用。

-----

<a id="model-experience"></a>
## 模型体验

无。本服务为浏览器 chrome 读取工作目录事实，不触及 prompt、工具 schema 或 session 事件。

#### KV Cache 影响

无；本服务既不会组装也不会发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了本服务回答什么、以及刻意不回答什么。

- **不含工作树状态** — 只读取 ref、worktree 目录名与 origin 仓库；Session 工作区的 dirty、staged 与 ahead/behind 需要更重的 git 读取，轮询无法承受。
- **Session checkout 只认 origin** — `status` 只读取 `origin` 与 github.com；托管在其他站点的 remote、fork 的 `upstream`，以及不叫 `origin` 的 remote 在那里都不可见。安装侧检查读取配置的 remote 名称，并以同样方式解析其 URL。
- **`status` 不做缓存** — 每次 `status` 调用都会启动 git；缓存答案恰好在调用方轮询以了解变化时过期，想要减少进程开销的部署应降低轮询频率。安装侧检查相反：因为读取会访问网络，它按 `checkIntervalMs` 缓存。
- **只比较同名分支** — 安装侧检查把 HEAD 与同名远端分支比较。默认分支名称不同的 fork 会得到 `none`，而不是与错误的历史比较。
- **不提供分支列表或切换** — 服务只读取当前 ref。
- **宿主必须安装 `git`** — 未安装 git 的宿主对每个工作区都回答 `none` 而不是报错；该功能只是不出现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

None.

</details>

**运行时不变式：** 不发布 companion。本服务不持有任何持久化或跨插件状态——Session 侧答案来自 Session header 与其子进程，安装侧答案来自进程内的间隔缓存，其 lookup 注册的生命周期完全处于自身构造之内。
