# 修复账号头像仍不显示

## 改动原因

云存档已同步但账号列表仍显示查分器图标。根因：头像 URL 写入 store 后组件未订阅更新；落雪账号缺少 API 回退；Phigros 同步失败时会用 null 清空头像缓存。

## 具体实现

1. `BoundAccountAvatar` 改为按 `accountId` 订阅 zustand 中的 `avatarUrl`
2. 新增 `resolve-account-avatar.ts`：落雪优先读快照，否则调 API；Phigros 读云存档 summary
3. 打开账号列表时 `syncAllAccountAvatars` 批量解析并写回 store
4. Phigros 同步时仅在解析成功时更新 `avatarUrl`，避免误清空

## 期望输出

游戏管理 / 切换账号页展示玩家头像，不依赖先进入总览 Tab。

## 实际输出

- 已实现 store 订阅与统一解析服务
- 单元测试覆盖落雪快照优先与 API 回退
