# 前端审计修复记录

日期：2026-09-16。基于 HEAD `3824b19` 的工作区修改，对应[修复前审计报告](./frontend-audit-2026-09-16.md)。本次以修复已确认缺陷、保留现有正常流程为范围，没有进行大规模重构或部署。

## 修复内容

原报告 F01–F24 均已实施前端修复或明确限制尚未接通的能力。涉及后端契约、真实微信授权及支付的部分，验证边界见文末。

| 编号 | 处理结果 | 主要代码 |
| --- | --- | --- |
| F01、F05、F06 | 请求按用户身份校验重试归属；晚到的登录恢复不能覆盖退出或新身份；保留退出版本，拒绝旧跨标签通知。正常的同账号刷新继续可用 | `src/api/authenticated.ts`、`src/auth/token-storage.ts`、`src/store/auth-slice.ts` |
| F02 | 顶部企业购买入口将账务主体传入支付弹窗，企业套餐、实名门禁和订单使用同一主体 | `src/components/header-purchase.tsx` |
| F03 | 编辑和重试只发送目标消息所属上下文段，清除过的旧对话不会回流 | `src/pages/console-core.tsx` |
| F04 | 微信授权码仅发送到明确受信任的精确 origin，删除通配发送；保留正式站点别名和明确回环开发来源 | `src/auth/wechat-authorization.ts`、`src/pages/wechat-callback.tsx` |
| F07 | 正文读取期间继续支持取消及超时；使用无数据进展超时，避免正常持续下载被固定总时长截断 | `src/api/http.ts` |
| F08 | 关单失败或状态不明确时保留订单，阻止直接新建第二单；充值弹窗同步处理关单失败和付款竞争 | `src/components/use-plan-payment.ts`、`src/pages/billing.tsx` |
| F09 | 有明确有效期的充值单持续查单至到期；缺少有效期时仍有有界自动查询和手动刷新，不无限请求 | `src/pages/billing.tsx` |
| F10 | 保留自定义角色 code，使用服务端角色选项，不再把自定义角色压成普通成员；保留所有者限制 | `src/pages/trae-enterprise.tsx` |
| F11 | 默认保留已有真实部门；虚拟公司根禁止选择但仍可展开；只提交真实部门 ID，嵌套子部门仍可选 | `src/pages/trae-enterprise.tsx` |
| F12、F24 | 企业错误提供持续可见的错误、请求 ID 和重试；钱包按企业隔离，失败显示未知金额，不复用上一企业余额或伪装为 0 | `src/pages/enterprise-console-shared.tsx`、`src/pages/recharge.tsx` |
| F13、F14 | 完整解析长视频成功响应；SSE 业务错误及无结束标识的中断视为失败，保留部分回答和错误追踪信息 | `src/api/video-runtime.ts`、`src/api/model-runtime.ts` |
| F15、F16 | 视频尺寸选择与最终请求使用同一值，保留原有四种实际支持的尺寸；未接通的末帧、声音明确不可用，帧交换同步实际参考输入 | `src/pages/video-generation.tsx`、对应局部 CSS |
| F17 | 对话、视频、图片输入框在输入法组合输入期间忽略发送回车 | `src/pages/console-core.tsx`、`video-generation.tsx`、`image-generation.tsx` |
| F18 | 文档和资讯成功加载后使用真实标题及可收录元信息；失败和不存在的详情保持 noindex | `src/seo/site-seo.tsx`、`src/pages/public.tsx`、`news.tsx` |
| F19 | 公开导航、页脚、文档和资讯链接统一语言路径；切换语言重新请求内容；修复 `/en` 切回中文时旧路由重新覆盖语言的竞争 | `src/routes/public-path.ts`、`src/components/common.tsx`、`src/App.tsx` 等 |
| F20 | 模型页分别展示加载、失败重试、空目录和成功结果，不再把演示模型及价格当作真实接口结果 | `src/pages/public.tsx`、`src/components/public-models-showcase.tsx` |
| F21 | 保留价格原始精度、币种、计量单位和分母；显示缓存项及不同视频计费条件，多项价格不会被卡片固定高度裁切 | `src/api/public-model-market.ts`、`src/components/public-model-prices.tsx`、对应局部 CSS |
| F22 | 兼容旧 `/console/members` 入口，跳转现有企业成员管理页 | `src/App.tsx` |
| F23 | `typecheck` 改为实际检查 TypeScript 引用项目的 `tsc -b --pretty false` | `package.json` |

附带纠正原报告中的未完成能力提示：客服明确为自助 FAQ 并指向真实联系入口；企业席位缺少接口时显示未知；未接通的重发邀请、移交所有者和部门排序不再假报成功；图片路由遵循已有关闭的功能开关。已有邀请链接、真实部门 CRUD、正常角色变更等流程保留。

新增界面文案包含中英文，样式放在所属组件和页面样式文件。沿用项目 AppModal，没有新增另一套弹窗。保留其他窗口已有的 `src/styles.css` 修改，没有执行全仓格式化、改写 CMS、创建真实订单或修改真实企业数据。

## 验证结果

| 检查 | 最终结果 |
| --- | --- |
| 全量测试及覆盖率 | **123 个测试文件、952 个用例通过**；修复前为 114 个文件、853 个用例 |
| 覆盖率门槛 | 通过。语句 85.23%、分支 77.79%、函数 88.31%、行 90.25%；仅限现有覆盖率配置包含的模块 |
| 类型检查 | `npm run typecheck` 通过 |
| 生产构建 | 通过；输出到独立临时目录，未覆盖工作区 `dist` |
| 包体预算 | 通过；首页 JS gzip **434.9 KiB**（原 433.6 KiB，预算 440 KiB），CSS gzip 100.5 KiB；没有提高预算 |
| 发布完整性 | 175 个资源引用检查通过 |
| 浏览器实际检查 | 公开页语言往返、文档标题/收录信息、模型多条件价格；合成企业钱包失败/重试/切换、成员自定义角色和部门提交、视频尺寸和实际请求；检查了桌面、390×844 手机、中英文及浅深色的相关界面 |

针对缺陷增加边界回归，也保留同账号刷新、正常支付关单、手动查单、正常流结束、旧接口角色选项缺省等兼容行为的检查。浏览器额外发现的语言竞争、虚拟根展开问题已修正并加入测试。最终全量测试在这些修改之后重新通过。

浏览器中的写操作使用隔离存储和完全模拟 API：实测自定义角色提交仍为 `finance_auditor`，部门提交为 `department-real`，竖屏视频实际参数为 `720x1280`。没有调用真实付款、生成或成员修改接口。

最终日志位于 `C:/Users/Admin/AppData/Local/Temp/tokennx-fix-20260916-test-final.log`、`tokennx-fix-20260916-build-final.log`；覆盖率目录为 `tokennx-fix-20260916-coverage`，完整构建目录为 `tokennx-fix-20260916-release-final`。浏览器合成页面保留在已忽略的 `.tmp-audit-*-20260916` 目录中，不作为产品路由发布。

## 依赖与未覆盖边界

- Vitest 与 coverage 从 4.1.10 更新到 4.1.11；nanoid 从 3.3.17 更新到 3.3.19。仅 10 个依赖节点版本变化，没有升级 Semi 或加入 overrides。完整测试、覆盖率和构建均在更新之后通过。
- **依赖审计仍有 31 个受影响节点（1 high、30 moderate）**，均来自 Tiptap 核心两项公告及依赖链传播；这不等于 31 个已证实可利用漏洞。源码未找到 Tiptap/RichText/AIChatInput 的使用入口。两项公告对应的最低整体修复版本为 3.30.5，但需要同步 Tiptap 的精确 peer 版本，普通更新预演出现版本混用，故本轮保留该项，另行做整组升级和 Semi 回归。详见[属性注入公告](https://github.com/advisories/GHSA-cp6q-959q-f8rh)、[Markdown ReDoS 公告](https://github.com/advisories/GHSA-j95f-988m-3j2f)，本地结果在 `.tmp-audit-auth-20260916/dependency-audit-after.json`。
- **真实微信扫码、支付完成/退款、后端授权规则尚未端到端验证**。本轮验证了前端状态和请求契约，不能代替真实账号及支付沙箱联调。
- F11 没有猜测“移出所有部门”的后端空值契约；仅禁止提交虚拟根。若需要该能力，应由后端明确 null/空字符串/专用操作的约定后实现。
- 模型接口缺少英文描述时仍展示接口返回的原文，前端没有伪造翻译。手机英文订阅胶囊空间、其他历史体验问题继续列在原报告的优化部分。
- 本机 Node 24.19.0 / npm 11.17.0 低于项目声明的 Node ≥26.5.0 / npm 12.0.1；上述结果不代表已在声明环境复验。
- `common.tsx` / 全局样式拆分、全仓格式治理、真实弱网性能测试、企业大目录分页和全面多浏览器回归仍属于后续优化，未混入此次缺陷修复。

现有回归、构建和抽查范围内未发现正常功能被破坏；这些证据不构成“所有环境绝对零回归”的保证。
