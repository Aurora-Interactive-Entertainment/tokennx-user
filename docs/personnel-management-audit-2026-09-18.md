# 人员管理接口核对与修复

依据用户于 2026-09-18 提供的 `y7siWR` 接口文档，核对人员管理的企业人员、部门管理、申请列表、邀请列表及现有操作入口。仅修正数据、权限和提交行为，沿用原有页面布局、样式及弹窗。

## 接口对照

以下路径均以 `/api/user/enterprise/{enterprise_id}` 为前缀。

| 操作 | 接口 | 核对与处理 |
| --- | --- | --- |
| 企业成员搜索、状态筛选 | `GET /members` | 保留服务端关键字匹配结果，避免公开用户 ID 命中后被前端再次过滤；完整读取分页 |
| 部门树及直属人员 | `GET /departments`、`GET /departments/{id}/members` | 部门人员响应包含后代，前端按实际部门 ID 筛直属成员；名称和邮箱按搜索框语义匹配 |
| 角色修改 | `PUT /members/{id}/role`、`POST /members/batch` | 多选使用原子批量接口，限制最多 100 人；保留字符串版本 |
| 调整部门、移除人员 | `PUT /members/{id}/department`、`DELETE /members/{id}` | 按具体权限及所有者/本人/状态限制禁用；跳过相同目标部门；部分失败也刷新结果，防止重放旧版本 |
| 部门新建、编辑、删除、详情 | `POST /departments`、`GET/PUT/DELETE /departments/{id}` | 编辑缺少限制数据时先读详情，完整提交原额度和限流配置；阻止删除已知非空部门；提交期间防重复；名称限制按文档调整为 128 |
| 部门人数、搜索 | 部门列表响应 | 去除演示人数，按子树计数计算直属人数；搜索覆盖折叠分支 |
| 加入申请及审核 | `GET /join-requests`、`PUT /join-requests/{id}` | 仅授予目录内有效的原申请角色；角色失效时禁止通过，保留拒绝；防重复提交 |
| 邀请创建、停用、重新生成、使用记录 | `GET/POST /invitations`、`PATCH /invitations/{id}`、`GET /invitations/{id}/usages` | 校验实际部门与非所有者角色；到期日按本地当天末尾换算毫秒；更新失败也刷新版本；重新生成后回到第一页 |
| 所有权移交入口 | 既有企业设置流程 | 导航到企业设置所有权区，复用原验证码与版本校验流程 |

操作权限以企业上下文的 `permissions` 为准；只有旧部署未返回该字段时才回退到现有 `capabilities`。所有者仍拥有管理权限。列表请求的加载、错误状态分开维护，避免相互覆盖。

## 验证

- 类型检查：`npm run typecheck` 通过。
- 截至 2026-09-18，本轮 11 个相关测试文件的 70 项测试通过，覆盖人员加载、权限、直属搜索、分页、批量角色、防重复提交、部分失败刷新、额度保留、折叠搜索、审批、邀请及相邻邀请落地页、企业治理和模型页面。
- 浏览器使用真实组件与独立模拟接口检查四个页签、直属成员/邮箱筛选、角色保存、审批确认、邀请弹窗，检查桌面及移动尺寸、浅色和深色显示。没有向真实企业发送人员变更请求。
- 未修改 API 请求公共层；其他窗口正在修改的所有权流程和无关页面不纳入本轮变更。

复验命令：

```sh
npm run typecheck
npm run test -- src/pages/enterprise-member-loader.test.ts src/utils/enterprise-member-access.test.ts src/pages/trae-enterprise-members.test.tsx src/pages/trae-enterprise-department-tree.test.ts src/components/trae-member-bulk-actions.test.ts src/components/trae-enterprise-join-requests.test.tsx src/components/trae-enterprise-invitations.test.tsx src/api/enterprise-console.test.ts src/pages/invite.test.tsx src/pages/enterprise-governance.test.tsx src/pages/enterprise-models.test.tsx
```

## 保留边界

- 文档未提供部门排序、待加入人员批量重发邀请接口，保留原有未开放提示，不显示虚假成功。
- 上下文未提供总席位/已用席位数据时保持 `—`，不将成员人数冒充席位数。
- 调整部门、移除人员没有原子批量接口，仍逐个调用；失败后刷新实际状态，已完成操作不会回滚。
- 成员表保留现有完整读取后展示方式；大企业仍可能产生多次分页请求，本轮未改变表格交互。
- 验证不等同真实后端端到端验收，真实环境中的权限拒绝、并发事务和通知副作用仍以服务端实现为准。
