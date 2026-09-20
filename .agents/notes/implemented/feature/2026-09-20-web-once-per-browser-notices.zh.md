# Agent Note: Web 通知在浏览器内只询问一次

Status: implemented

[English](2026-09-20-web-once-per-browser-notices.md) | 中文

## 问题

有两个 Web 界面会重复用户已经接受的提示。新建对话的 hero 每次渲染都带着 Preview 徽标；把权限预设切到 Full access 时，无论从设置行、输入框的权限控件还是 `/permission` 弹窗进入，都会在用户已勾选确认之后再次弹出共用的风险对话框。这两条提示陈述的是浏览器使用者的事实，而不是某个 Session 的事实：之后的 Session 不会让先前的答复过期，而在被接受之后又反复出现的警告只会训练用户去忽略它。

## 决策

[`ui-primitives`](../../../../packages/client/ui-primitives/README.zh.md) 导出 `isRiskAcknowledged(key)` 与 `acknowledgeRisk(key)`，每个风险对应一条 `dsh.risk-acknowledged.<key>` localStorage 记录。存储被阻止或不可用时读取结果为"未确认"，警告因此保留而不是假定同意；无法写入的接受只留在当前页面。

Full access 闸门声明该键。`SelectConfirmation` 新增可选的 `acknowledgementKey`；弹窗外壳在打开对话框前读取它，并在确认落定时记录它，[`ui-permission-presets`](../../../../packages/client/ui-permission-presets/README.zh.md) 只为 Full access 填入预设 id。于是设置行、输入框权限控件与 `/permission` 弹窗共用同一份答复，而 Auto review 保留自己的闸门。hero 的 Preview 徽标在首次渲染时占用 `dsh.hero.preview-badge`，之后不再绘制徽标。

## 测试

新增的 `ui-primitives` spec 覆盖按键记录与读取，以及两个函数在存储被阻止时的路径。`popup.client.spec.ts` 证明带键闸门只询问一次、在确认时记录接受，并在同一浏览器的下一次选择中直接落定而不弹对话框。`permission-select.client.spec.tsx` 与 `permission-presets-row.client.spec.tsx` 在每个用例前清除该键，证明首次切换仍要求确认，也证明已记住的浏览器直接切换。`skeleton.client.spec.tsx` 证明 hero 首次渲染显示徽标、同一浏览器的下一次渲染不再显示。`pnpm run test:gui` 覆盖组装后的客户端。

## 备选方案

- **把确认存进 Host 设置文档。** 否决：该事实属于浏览器范围，而同一个 Host 文档会被打开同一 profile 的所有浏览器共享。
- **删除 Full access 警告。** 否决：首次切换仍需要显式确认，只有重复才是噪音。
- **按界面分别记录确认。** 否决：三个界面警告的是同一预设，三个键就会询问三次。
- **按 Session 记录。** 否决：新 Session 会重新询问用户早已给出的长期答复。
- **直接去掉 hero 徽标。** 否决：它是产品首次访问时的预发布标记；要求是不要重复，而不是删除。
- **在 shell 中做通用通知注册表。** 否决：两处调用不足以支撑注册表，且两者各自已经持有自己的持久化键。

## 后果

- 已接受 Full access 警告的浏览器切换预设时不再弹对话框，包括同一来源下的其他 profile；清除站点数据即恢复警告。
- hero 徽标在同一浏览器的同一来源下只显示一次。
- 三个 Full access 界面不会分叉：它们读取同一个键。
- Auto review 每次选择仍会询问，因为它的闸门覆盖的是另一种授权。
- 无任何模型可见面、session 事件或 Host 文档变化。
