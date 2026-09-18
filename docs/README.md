# 文档索引

本目录保存审计、优化与实施的记录。

约定：一轮工作只新增或更新**一份实施记录**（写清做了什么、验证到什么程度、哪些边界没有验证）；诊断报告在对应修复完成后移入 `archive/`，仅作溯源，避免和现行文档混在一起。文档里尽量少写会过期的数字（用例数、体积、行号），需要时标注"截至某日快照"。

## 现行文档

| 文档 | 状态 | 内容 |
| --- | --- | --- |
| [personnel-management-audit-2026-09-18.md](./personnel-management-audit-2026-09-18.md) | 已完成 | 人员管理接口核对、修复、验证与保留边界 |
| [code-optimization-plan-2026-09-18.md](./code-optimization-plan-2026-09-18.md) | 进行中（阶段 2–7 待实施） | 渐进式优化路线图、执行约束与验证/交付规则 |
| [code-optimization-phase-0-1-2026-09-18.md](./code-optimization-phase-0-1-2026-09-18.md) | 已完成（阶段 0–1） | 基线建立与无用代码清理的实施及验证记录 |
| [frontend-audit-fixes-2026-09-16.md](./frontend-audit-fixes-2026-09-16.md) | 已完成 | 前端审计 F01–F24 的修复范围与验收结果 |
| [text-overflow-audit-2026-09-17.md](./text-overflow-audit-2026-09-17.md) | 已完成 | 文字溢出与响应式适配的修复清单 |

## 归档（历史快照，仅作溯源）

| 文档 | 说明 |
| --- | --- |
| [archive/frontend-audit-2026-09-16.md](./archive/frontend-audit-2026-09-16.md) | 修复前的原始审计报告；结论与验收已并入修复记录 |
| [archive/code-bloat-audit-2026-09-18.md](./archive/code-bloat-audit-2026-09-18.md) | 代码体积与结构诊断；结论已并入优化方案与阶段记录 |
