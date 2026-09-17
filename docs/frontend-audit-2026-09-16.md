# Token NX 用户端前端审计

> 本文保留修复前的审计快照。2026-09-16 后续已实施修复，当前状态、验收结果及剩余边界请见[修复记录](./frontend-audit-fixes-2026-09-16.md)。

审计日期：2026-09-16。对象：`D:/Project/tokennx-user` 当前工作区。审计方式：模块人工审查、现有全量测试与覆盖率、隔离缺陷复现、生产构建与资源检查、真实浏览器公开页面检查。

## 结论

项目已有可用的工程基础：TypeScript 严格模式、路由懒加载、认证刷新协调、支付订单校验、Markdown 净化、Sentry 脱敏和发布完整性检查都已实现。但测试通过尚不能代表关键业务边界可靠。本轮整理出 **24 项需要处理的问题，其中 4 项建议按 P1 优先处理、20 项按 P2 排期**；另列出未完成能力与工程优化。

最需要先解决的是账号切换时的请求归属、企业购买的账务归属、对话上下文隔离，以及微信授权码发送目标。没有在本轮确认 P0 级故障，也没有进行真实支付、真实授权码兑换或后端越权验证。

P1 表示应优先修复的业务/安全边界问题；P2 表示需要排期修复的功能、可靠性或工程检查缺陷。优先级表达修复顺序，不表示每个条件已经在线上发生。

## 验证结果与范围

| 检查 | 结果 | 解释 |
| --- | --- | --- |
| 现有全量测试 | 114 个文件、853 个用例通过 | 没有把新增审计复现混入此数字 |
| 覆盖率 | 语句 83.99%、分支 75.87%、函数 86.69%、行 89.36% | 仅适用于配置指定的模块，不是全部前端 |
| 实际 TS 项目检查 | `tsc -b --pretty false` 通过 | 单独的 `npm run typecheck` 存在下文 F23 问题 |
| 生产构建 | 通过 | 使用独立临时输出目录，未覆盖项目 `dist` |
| 体积预算 | 通过 | 首页 JS 1338.3 KiB / gzip 433.6 KiB；CSS 656.9 KiB / gzip 100.5 KiB |
| 静态发布检查 | 通过 | 175 个资源引用校验通过 |
| 格式检查 | 未通过 | Prettier 报告 353 个文件存在格式问题；没有执行全仓格式化 |
| 依赖审计 | 35 个受影响依赖节点 | 2 high、33 moderate；不能理解为 35 个已证实的线上漏洞 |
| 浏览器 | 已检查公开页面 | 首页桌面/手机、中英文、浅深色、导航、文档与资讯详情、模型接口失败场景 |

浏览器验证使用本地前端及其已配置的公开 API；桌面视口约 1274×717、手机视口 390×844。抽查页面未发现整页横向溢出，已查看实际截图；没有据此声称所有控制台页面、Safari 或实体微信浏览器均通过。登录后的写业务使用合成账号和 mock API 做隔离复现，没有发起真实订单、付费生成、修改用户或企业数据。

本机运行环境为 Node 24.19.0 / npm 11.17.0，项目声明 Node >=26.5.0 / npm 12.0.1。上述检查在本机环境通过，不等同于已在声明环境复验。

构建版本为 `build-20260916104401-11000f77528d`。审计期间其他窗口把开始时已有的 4 个工作区改动提交为 HEAD `3824b19`；变化涉及首页装饰、充值协议弹窗和一个支付测试，随后还出现 `src/styles.css` 的新修改。本轮没有覆盖这些改动，没有修改业务源码；测试与体积数字对应本轮检查快照，报告行号以检查时文件为准。

## 优先修复：P1

### F01：A 账号的待处理修改可能用 B 账号身份重试

位置：[authenticated.ts:30](D:/Project/tokennx-user/src/api/authenticated.ts:30)。证据：隔离执行实际源码，记录了两次请求。

触发：A 发出修改昵称请求，401 返回前另一标签页登录 B；认证层发现内存 token 改变，直接用 B token 重发 A 的原始请求体。实现没有区分“同一账号刷新”和“切换账号”。实测同一 PUT 先携带 A token，随后携带 B token。其他共用认证重试层的写接口也需要检查。

影响：原本针对 A 的操作可能作用于 B。此次证明错误身份的写请求会被发出，没有修改真实后端。

修复：请求开始捕获稳定用户 ID 与会话代次；只有仍属于同一身份的请求才允许重试。身份切换后取消旧请求，提交结果前再次校验归属。不要仅比较会轮换的 refresh token。

### F02：企业顶部购买入口按个人账户下单

位置：[header-purchase.tsx:60](D:/Project/tokennx-user/src/components/header-purchase.tsx:60)、[purchase-payment-modal.tsx:53](D:/Project/tokennx-user/src/components/purchase-payment-modal.tsx:53)。证据：真实组件组合、mock API 的定向测试。

`ConsoleLayout` 已传入企业 `billingContext`，套餐目录也按企业查询，但 `HeaderPurchase` 没有把 context 继续传给支付弹窗。弹窗默认 `personal`，同时进入个人实名校验。实测企业目录选择套餐后，创建订单参数为 `{account_type:'personal'}`。

影响：企业用户可能购买到个人账户，或因套餐与主体不匹配而失败；企业与个人认证门禁也混用。是否实际扣入错误账户取决于后端校验，未执行真实支付。

修复：目录、实名门禁、订单创建、查单、关单和支付后的刷新始终传递同一账务上下文；补企业顶部入口的完整组件测试。

### F03：清除上下文后编辑新消息，会重新发送已清除的旧内容

位置：[console-core.tsx:369](D:/Project/tokennx-user/src/pages/console-core.tsx:369)。证据：定向组件测试复现。

触发：发送旧内容并收到回复 → 清除上下文 → 发送新问题并收到回复 → 编辑这个新问题再次发送。正常新增消息遵守上下文分段，编辑分支却使用 `messages.slice(0, replacementIndex)`。实测第三次请求重新包含旧问题及旧回答。

影响：清除承诺失效，旧敏感内容可能重新发给模型，并影响新回答；这不是跨账号泄露。

修复：编辑/重试从目标消息所属上下文段的起点截取；覆盖清除多次、编辑当前段和重试失败消息。历史落库时的截断发生在请求之后，不能代替发送前隔离。

### F04：微信回调把授权码发送给未经验证的收件窗口

位置：[wechat-callback.tsx:25](D:/Project/tokennx-user/src/pages/wechat-callback.tsx:25)、[wechat-callback.tsx:43](D:/Project/tokennx-user/src/pages/wechat-callback.tsx:43)。证据：组件 effect 的隔离执行。

发送目标来自任意 `document.referrer` origin；没有可用 referrer 时退回 `'*'`。实测非本站 referrer 和空 referrer 两种场景都会向该窗口发送完整合成 code/state。本站接收端检查 origin/source/state，不能防止恶意收件页拿到发送出去的数据。

影响边界：攻击者需要持有授权窗口的 opener/parent，并诱导用户在该窗口完成授权；能否进一步兑换或接管账号，还取决于后端 state 与发起会话的绑定。本轮没有真实授权码，未证明账号接管。

修复：发送目标只允许明确的正式站点白名单；开发来源单独限制；无法确定可信目标时停止发送。同步核验服务端授权会话绑定，调整当前期待 `'*'` 的测试。

## 功能与可靠性问题：P2

### F05：晚到的登录恢复结果覆盖退出状态或新身份

位置：[auth-slice.ts:74](D:/Project/tokennx-user/src/store/auth-slice.ts:74)、[auth-slice.ts:180](D:/Project/tokennx-user/src/store/auth-slice.ts:180)。已复现。

`hydrateAuth` 等待 `/me` 时，其他标签页退出或登录 B；旧请求随后 fulfilled，无条件写回 A。实测既出现“token 已清空但 Redux 又是 authenticated”，也出现“B token 配 A 用户”。应按会话代次/requestId 丢弃旧结果，并取消已失效的恢复请求。

### F06：退出后，旧跨标签通知可以恢复前端会话

位置：[token-storage.ts:230](D:/Project/tokennx-user/src/auth/token-storage.ts:230)、[token-storage.ts:394](D:/Project/tokennx-user/src/auth/token-storage.ts:394)。已复现。

退出删除持久化 session，同时失去用于比较的最后 revision；此前尚未交付的旧 `session-updated` 会被接受。应保留退出版本记录及最后应用的 revision，在 session 不存在时也拒绝旧消息。这里确认的是前端旧凭证恢复，不能等同于绕过服务端 token 撤销。

### F07：HTTP 正文读取阶段不再受超时和取消控制

位置：[http.ts:201](D:/Project/tokennx-user/src/api/http.ts:201)、[exports.ts:248](D:/Project/tokennx-user/src/api/exports.ts:248)。已复现。

`fetch` 在收到响应头后就结束等待，finally 立即清除超时和外部 abort 监听；随后的 JSON/blob 正文如果挂住，请求可能长期不结束。实测外部 signal 已取消、实际 fetch signal 未取消、超时数量为零而 Promise 仍未完成。应把控制器生命周期延长到正文消费完成，并覆盖慢正文、下载取消及正文解析异常。

### F08：切换支付渠道时，关旧单失败仍新建订单

位置：[use-plan-payment.ts:292](D:/Project/tokennx-user/src/components/use-plan-payment.ts:292)、[use-plan-payment.ts:334](D:/Project/tokennx-user/src/components/use-plan-payment.ts:334)。已复现。

旧单关单遇到网络错误/普通服务端错误时被吞掉，随后清除旧单引用并创建第二单。旧二维码可能仍有效，也可能已支付但查询未确认。复现中关单 `Failed to fetch` 后出现第二单且无错误提示。

修复：把“已关闭”“已支付”“状态未知”明确区分；无法确认旧单结束时保留并提示重试，不直接创建新单。重复扣款是否发生取决于后端防重及用户付款，本轮没有真实扣款。

### F09：充值二维码仍有效时，自动查单已经停止

位置：[billing.tsx:675](D:/Project/tokennx-user/src/pages/billing.tsx:675)、[use-billing-payment-polling.ts:50](D:/Project/tokennx-user/src/components/use-billing-payment-polling.ts:50)。已复现。

订单二维码有效期可以为 15 分钟，轮询却在 5 分钟停止，充值页仅提示状态未知。复现到第 5 分 20 秒支付成功时，未再触发订单更新；不能据此断言后端没有到账，但前端无法自动确认。应按订单有效期及页面可见性续查，或撤掉二维码并提供明确的查单恢复入口。

### F10：企业自定义角色被压成普通成员

位置：[trae-enterprise.tsx:96](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:96)、[trae-enterprise.tsx:2156](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:2156)。已复现。

成员模型只保留 owner/admin/member，自定义角色丢失；打开“修改角色”直接确认，会把 `finance_auditor` 提交为 `member`。更改部门本身不会改角色。应保存服务端原始 role code，使用 `role_options` 渲染和编辑，未改变选择时不提交。

### F11：成员变更部门提交虚拟根 ID

位置：[trae-enterprise.tsx:1309](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:1309)、[trae-enterprise.tsx:2153](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:2153)。已复现请求内容；后端如何处理该值尚待联调。

默认部门值是 UI 虚拟节点 `company`，直接确定会把它当真实 `department_id` 发出。同文件新增/编辑部门已把虚拟根转换为空值，成员变更没有做转换。应统一根节点/未分配部门的 API 表示，并使用成员现有部门初始化弹窗；最终空值形式需按后端契约确认。

### F12：企业接口失败后只留一个会消失的 Toast

位置：[enterprise-console-shared.tsx:127](D:/Project/tokennx-user/src/pages/enterprise-console-shared.tsx:127)。已复现。

`EnterpriseError` 接收 requestId 和 onRetry，却只弹 Toast 然后 `return null`。企业上下文加载失败时正文空白，用户没有持久错误说明和重试入口。应渲染错误态与重试操作，保留请求编号供排查。

### F13：长视频成功响应被裁成无效 JSON

位置：[video-runtime.ts:209](D:/Project/tokennx-user/src/api/video-runtime.ts:209)。已复现。

所有响应在解析前都截取前 4096 字符，原本用于错误文案的长度上限误用于成功响应。成功体含较长 prompt/metadata 时，解析失败被当成空对象；GET 会回退成 pending/null，POST 可能误报缺任务 ID。成功响应必须完整解析，错误文案在展示或记录时再裁剪。

### F14：SSE 中途失败被当成成功的半条回答

位置：[model-runtime.ts:198](D:/Project/tokennx-user/src/api/model-runtime.ts:198)、[console-core.tsx:438](D:/Project/tokennx-user/src/pages/console-core.tsx:438)。已复现。

流先返回文本，随后返回 error 对象，最后 DONE；错误事件未被识别，只要已有非空内容就保存成功回答。应逐事件识别 error/业务错误，保留错误与 Request ID；也应明确处理未正常结束的 EOF，保留部分内容同时展示失败与重试。

### F15：视频比例和分辨率选择与实际 size 不一致

位置：[video-generation.tsx:42](D:/Project/tokennx-user/src/pages/video-generation.tsx:42)、[video-runtime.ts:244](D:/Project/tokennx-user/src/api/video-runtime.ts:244)。调用链确认。

4:3 被映射成 16:9；3:4 被映射成 9:16；480P 和 720P 使用相同尺寸，竖屏/方形下切换部分分辨率也不改变 size。后端支持范围尚未实测，但前端显示与发送不一致已确定。应依据模型能力提供选项，以同一结构生成文案和请求参数。

### F16：视频末帧、交换帧和声音开关未完整生效

位置：[video-generation.tsx:656](D:/Project/tokennx-user/src/pages/video-generation.tsx:656)、[video-generation.tsx:832](D:/Project/tokennx-user/src/pages/video-generation.tsx:832)、[video-runtime.ts:244](D:/Project/tokennx-user/src/api/video-runtime.ts:244)。调用链确认。

提交只携带单个 inputReference；末帧和声音状态没有进入请求。交换按钮改变预览图片，却没有同步实际 inputReference。应统一参考帧状态与提交快照；服务端不支持的功能应隐藏或禁用并说明，不能保留看似生效的操作。

### F17：中文输入法确认候选会误发送

位置：[console-core.tsx:672](D:/Project/tokennx-user/src/pages/console-core.tsx:672)、[video-generation.tsx:928](D:/Project/tokennx-user/src/pages/video-generation.tsx:928)。对话组件已复现，视频有同型处理。

Enter 发送处理没有排除 composing 状态，模拟 `isComposing=true/keyCode=229` 仍提交了未完成的 `ceshi`。应统一组合输入保护，覆盖 Windows 拼音、macOS 和移动输入法；视频场景还涉及意外发起付费任务。

### F18：公开文档和资讯详情被禁止收录，标题也不对

位置：[site-seo.tsx:177](D:/Project/tokennx-user/src/seo/site-seo.tsx:177)。真实浏览器确认。

SEO 只识别静态路由表和旧模型详情路径，`/docs/:id/:slug` 与 `/news/:id` 被当成未知页。实际有正文的页面显示 `Model Details - Token NX`，robots 为 `noindex, nofollow`，没有 canonical。应增加动态文档/资讯元信息；使用标题、摘要和公开语言路由，真正不存在的内容才 noindex。

### F19：语言状态、路由和服务端语言内容不同步

位置：[App.tsx:299](D:/Project/tokennx-user/src/App.tsx:299)、[common.tsx:1887](D:/Project/tokennx-user/src/components/common.tsx:1887)、[public-docs.ts:98](D:/Project/tokennx-user/src/api/public-docs.ts:98)、[public.tsx:138](D:/Project/tokennx-user/src/pages/public.tsx:138)。部分浏览器实测，部分调用链确认。

实测 `/en/about` 点击语言开关仍回到英文；`/en/docs` 自动跳到不带 `/en` 的文档 URL。模型公开页请求只在挂载时执行，切语言只改变本地标题，没有重新请求按 Accept-Language 返回的模型说明等单语言字段；API 同时返回 *_en 的部分内容不受此限制。

修复：明确语言路由为统一来源，切换时导航到对应路径；所有公开链接通过公共路径函数生成；依赖服务端语言的请求把 locale 纳入缓存键和 effect 依赖，取消旧语言请求。

### F20：模型接口失败时展示无标识的示例价格和错误分类

位置：[public.tsx:119](D:/Project/tokennx-user/src/pages/public.tsx:119)、[public.tsx:150](D:/Project/tokennx-user/src/pages/public.tsx:150)。浏览器阻断 `/api/model-market` 后确认。

加载中、空目录、失败和映射无结果都可回退本地 MODEL_CATALOG；没有明确的加载/失败说明。列表按数组位置切三组，将 Qwen/GLM 等文本模型放在视频组，Llama/Mistral 等放在图片组，并显示本地示例价格。英文页面还会出现中文说明。

修复：分别呈现 loading、empty、error 和成功数据；失败提供重试。若确需示例，必须明确标识并避开正式价格/购买语义，分类按模型真实 modality 生成。

### F21：公开模型价格忽略实际计费单位

位置：[public.tsx:94](D:/Project/tokennx-user/src/pages/public.tsx:94)、[public-models-showcase.tsx:131](D:/Project/tokennx-user/src/components/public-models-showcase.tsx:131)。调用链确认。

API 包含 unit_quantity/unit/currency；映射丢掉数量和币种，展示固定 Input/Output / M Tokens 与 ¥。例如接口给出每 1000 token 为 ¥0.002，当前会标成每百万 ¥0.002，而非换算后的 ¥2。按次、按秒的图片/视频价格也无法由输入/输出两字段正确表达。

修复：复用项目已有精度/金额工具，保留完整计量元数据，按 meter_kind 展示；只有明确换算后才能统一为每百万 token。真实账单是否算错不在本项结论内。

### F22：首页“创建企业部门”指向不存在的路由

位置：[home.tsx:545](D:/Project/tokennx-user/src/pages/home.tsx:545)、[App.tsx:217](D:/Project/tokennx-user/src/App.tsx:217)。浏览器实际 CMS 数据确认。

当前运营链接是 `/login?return=%2Fconsole%2Fmembers`，项目实际成员页为 `/console/trae-enterprise/users`，不存在 `/console/members`，兜底会回首页。这是当前 CMS 数据与前端路由契约不一致；应修正运营配置并加入路由校验，必要时兼容旧入口。

### F23：独立 typecheck 命令空跑

位置：[package.json:16](D:/Project/tokennx-user/package.json:16)、[tsconfig.json:2](D:/Project/tokennx-user/tsconfig.json:2)。命令验证。

根 tsconfig 是 `files:[]` 加 references；`tsc --noEmit` 不递归构建引用项目。实测追加 `--listFiles` 没有列出任何文件。因此单独执行 typecheck 的成功无法证明 src 类型正确。当前 build 使用的 `tsc -b` 能检查业务项目并已通过。

修复：改为构建引用项目的类型检查，或显式分别指定 app/node 配置；CI 采用同一检查路径，避免只跑空命令。

### F24：切换企业后，充值页可能长期显示上一家企业余额

位置：[recharge.tsx:63](D:/Project/tokennx-user/src/pages/recharge.tsx:63)。真实页面组件配合 mock API 已复现。

wallet 没有记录其所属账务主体，切换企业时也不清空；新企业请求发生非认证错误时被静默吞掉。实测 A 企业余额为 123.45，切换到 B 且请求失败后，页面仍显示 123.4500，没有错误状态。这是旧数据在当前页面错误展示，不代表取得了当前用户无权访问的企业余额。

修复：钱包状态携带主体 key，只展示与当前主体匹配的数据；为加载、失败和重试提供明确状态，不能用旧金额或默认 0 冒充有效余额。

## 未完成能力与数据真实性

- **公开客服仍是本地 mock。** [common.tsx:4834](D:/Project/tokennx-user/src/components/common.tsx:4834) 延迟调用固定回复，没有提交客服系统；[support-chat.ts:27](D:/Project/tokennx-user/src/components/support-chat.ts:27) 却承诺转人工、几分钟回复。用户可能误以为退款或故障已受理。建议优先接真实工单，或明确改成自助 FAQ 并提供真实联系方式。
- **企业席位统计是固定值。** [trae-enterprise.tsx:90](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:90) 固定总数 10、占用 4/10，直接显示在真实成员管理页。应接真实统计，缺数据时显示不可用，不能以演示数代替。
- **部分企业操作只有成功提示或本地效果。** [trae-enterprise.tsx:1627](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:1627) 的批量发送邀请、[移交管理员:1970](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:1970) 仅 Toast，未调用对应 API；[部门排序:1695](D:/Project/tokennx-user/src/pages/trae-enterprise.tsx:1695) 仅更新本地数组。用户可能认为操作已保存，刷新后却没有结果。应接真实接口或明确标记暂不可用。
- **图片菜单已隐藏，但直接路由仍存在。** [console-features.ts:2](D:/Project/tokennx-user/src/config/console-features.ts:2) 为 false；[App.tsx:221](D:/Project/tokennx-user/src/App.tsx:221) 仍提供 `/console/image`。该页本地定时器必定生成失败记录。应把功能开关同步到路由；本报告不把它说成已在菜单公开上线的故障。
- **状态页明确说明监控未接入。** 这是能力缺口，不能把其“监控不可用”文案算成未知 bug。上线监控后应让状态来自真实服务。
- 企业成员页的细粒度按钮权限仍需按 capabilities/permissions 适配；前端展示写按钮不等同于服务端允许越权，需使用只读角色联调确认。

## 工程、性能与体验优化

| 优先级 | 优化方向 | 当前证据及建议 |
| --- | --- | --- |
| 高 | 增补关键状态边界测试 | 当前覆盖率排除了 auth/store、多数页面、支付 hooks 等；这些模块有测试，但未进入覆盖率门槛。优先纳入认证代次、支付主体、上下文隔离、SSE 失败等关键路径，按模块设门槛 |
| 高 | 补浏览器业务回归 | 现有 jsdom 不能发现真实布局、输入法、iframe、支付返回和跨标签交错。建立测试账号/支付沙箱，覆盖桌面与手机、中英文、两种主题、企业只读/自定义角色 |
| 中 | 按职责拆 common.tsx | 约 5412 行混合登录、布局、菜单、模型展示、通知和客服。按业务职责拆组件，抽离请求与状态逻辑；避免仅按行数机械切分 |
| 中 | 清理全局样式 | styles.css 约 21984 行，已明显违背集中样式文件应保持有限职责的目标。把页面/业务样式迁回相应模块，保留变量、基础样式与通用原语；按页面截图逐步验证 |
| 中 | 优化首屏依赖 | 首页 gzip JS 433.6 KiB，接近 440 KiB 门槛；未压缩 JS+CSS 约 2 MiB，尚未计图片、iframe和其他脚本。应检查公共组件静态导入链，将只在打开时需要的业务弹窗/依赖延迟加载，按路由加载翻译资源 |
| 中 | 预算包含真实首屏资源 | 现有 size 脚本明确不计图片/独立 HTML。首页 iframe 特效、二维码及图片还会增加请求和绘制成本。补生产冷缓存、弱网、低端手机的 LCP/INP/CLS 实测，不能用“预算通过”代替体验指标 |
| 中 | 统一格式与静态检查 | 未找到仓库统一 Prettier 配置/ESLint 流程，当前格式检查 353 文件不通过。先确定项目现有风格并按修改范围治理，再做独立格式提交；不要在功能修复中混入全仓格式化 |
| 中 | 控制视频组件状态复杂度 | 把参数、参考帧、任务提交/轮询、历史列表拆开，使用单一提交快照，减少界面状态未进入请求的情况 |
| 中 | 企业目录按需加载 | trae-enterprise.tsx:115 的筛选路径串行拉取全部匹配成员，上限 100 页×100 条后静默截断，并一次渲染表格；部门树还递归并行加载所有子树。采用服务端分页、必要的虚拟列表、子树懒加载和并发限制；超出上限必须明确说明 |
| 中 | 移除测试专用生产分支 | public.tsx 的文档缓存通过 jsdom userAgent 改变行为，测试绕过了生产缓存/去重路径。应注入/清理缓存，使用与生产一致的代码路径 |
| 低 | i18n 与可访问性清理 | 清理 adaptive 等直出文案、轮次限制展示不一致；检查手机英文订阅入口的文字空间与浅色对比度、图标按钮、折叠菜单键盘访问。抽查视觉通过不代表所有组件均通过 |
| 低 | 遗留代码与开发文档 | 存在未使用的 NotFoundPage、CSV 导出帮助函数和演示状态。按引用链确认后清理；统一 Node/npm 声明、README 和实际 CI，避免安装与检查行为不同 |

不建议为了降低统计数字直接抬高预算、删除有价值测试或一次性重写认证与支付。先修复真实边界并建立回归保护，再分批拆组件和样式。

## 依赖与安全检查

`npm audit` 返回 35 个受影响节点，主要是同一个 Tiptap 问题沿扩展依赖传播，再加 nanoid 和 Vitest。它们不是 35 条独立可利用漏洞。

| 依赖链 | 本地版本与判断 | 处理建议 |
| --- | --- | --- |
| Semi UI → Tiptap | core 3.29.2；命中属性合并与 Markdown 属性解析公告。本项目未找到直接 Tiptap 使用，未验证漏洞函数进入实际可达路径 | 通过兼容的依赖更新修复整组 Tiptap，确认 Semi 功能和构建。参考维护者的[属性合并公告](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-cp6q-959q-f8rh)和[解析耗时公告](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-j95f-988m-3j2f) |
| Vite → PostCSS → nanoid | 3.3.17；属于当前开发/构建链。零长度自定义生成器触发条件未在本项目验证 | 更新锁定依赖并复验构建；参考[安全公告](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| Vitest / coverage / mocker | 4.1.10；开发服务器文件读取问题，当前测试是 jsdom，未发现公开 mocker 服务 | Vitest 与 coverage 一起更新到包含 4.1.11 修复的兼容版本；参考[维护者公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) |

本轮已检查但没有确认漏洞的保护：Markdown 原始 HTML 后执行净化；发票下载有 origin/path 白名单；Sentry 有敏感字段清理和采样；刷新有互斥与旧 token 条件写入。没有发现这些保护需要整体推翻的证据。未使用的 CSV 帮助函数存在加固空间，但当前没有调用点，不列为已确认的 CSV 注入漏洞。

## 建议修复顺序与验收

1. **先处理 F01–F04。** 验收：任何 A 会话请求不能在 B 身份下重发；企业全支付链路携带同一主体；清除后的上下文不会回流；授权码不会发送给未知 origin。
2. **接着处理认证、支付和企业状态问题 F05–F12、F24。** 使用多标签、慢响应、关单异常、长有效期订单、自定义角色、根部门和切换企业后钱包请求失败用例验收。F08 若后端不能保证订单互斥，应提升为 P1。
3. **修复生成链路 F13–F17 和模型价格 F21。** 对比 UI 参数与最终请求，覆盖完整/失败/中断流和长成功响应。
4. **修复公开页面 F18–F20、F22 与 typecheck F23。** 加入动态路由 SEO、语言跳转、接口失败和单位换算测试，同时纠正 mock 客服与演示统计。
5. **随后做依赖更新、首屏与组件拆分。** 每批变更复验相关功能、响应式与主题，避免把纯重构混入支付/认证修复。

## 本地复现材料

审计材料当时存放在已有 `.gitignore` 忽略的临时目录，未进入默认测试集合；这些临时材料已按项目清理要求删除。认证与企业测试当时采用“断言缺陷确实发生”的写法，因此通过意味着复现成功；生成测试采用“断言正确行为”的写法，因此当时失败意味着揭示了缺陷。两者都不改变原有 853 个测试全部通过的事实。

- 认证复现脚本及输出：当时验证了 7 个合成场景，无真实网络。
- 企业与支付复现配置及输出：当时通过 7 个用例成功复现企业购买、关单异常、角色、部门、错误态、晚付款和切换企业余额问题。
- 模型与视频子报告：当时记录了 4 个针对性失败用例及静态调用链说明。
- 原有测试、构建、格式和依赖日志保存在 `C:/Users/Admin/AppData/Local/Temp/` 下的 `tokennx-audit-20260916-*` 文件中；生产产物与覆盖率也在独立临时目录。

这是一轮覆盖主要模块的前端审计，不能替代后端授权测试、支付沙箱端到端验收、真实账号联调和多浏览器兼容测试。未验证范围已在各项中标明；本轮只交付审计结果和复现证据，未实施业务修复。
