# 修复账号列表头像不显示

## 改动原因

用户反馈切换页与游戏管理仍无头像。根因包括：1) 仅依赖 `use-game-data` 写入 `avatarUrl`，游戏管理页未挂载该 hook；2) Phigros 存档 avatar 可能是内部 key（如 `Cipher1`），需经 OSS `metadata/tmp.tsv` 映射到文件名；3) 远程图应使用 `expo-image` 与曲库封面一致。

## 具体实现

1. 新增 `phigros-avatar-resolver.ts`：加载 tmp.tsv，将内部 key 映射为 `avatars/{文件名}.png`
2. `BoundAccountAvatar` 改用 `expo-image`，并通过 `useBoundAccountAvatarUrl` 在渲染时从缓存 / 会话 / 云存档解析 URL
3. `BoundAccountGroupedList` 挂载时触发 `hydrateBoundAccountAvatars`
4. `use-game-data` 使用 resolver 并增加 `activeAccountId` 守卫，查询版本升至 13

## 期望输出

打开账号切换或游戏管理即可看到 Phigros / 落雪玩家头像，无需先进入总览 Tab。

## 实际输出

- 已实现懒加载解析与 alias 映射
- 单元测试覆盖 tmp.tsv 映射与 URL 构建
- 后续核对 OSS manifest：`avatars/` 文件名与 tmp.tsv 第二列（内部 key）一致（如 `Cipher1.png`），已修正映射方向
