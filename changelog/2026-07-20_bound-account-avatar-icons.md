# 账号列表使用玩家头像替代查分器图标

## 改动原因

总览切换页与设置中的账号管理，Phigros TapTap 与舞萌落雪咖啡屋账号仍显示查分器品牌图标，与玩家身份关联弱。Phigros 头像资源已按 demo/phigros-resource-publisher 上传至 OSS，落雪头像可通过 iconId 从 LXNS 素材 CDN 获取。

## 具体实现

1. 新增 `domain/account-avatar.ts`：按 OSS 路径 `phigros/releases/{version}/avatars/{name}.png` 与 `assets2.lxns.net/maimai/icon/{id}.png` 构建 URL
2. `BoundAccount` 增加可选 `avatarUrl`；新增 `BoundAccountAvatar` 组件，优先远程头像，失败时回退查分器图标
3. `BoundAccountGroupedList` 账号行改用 `BoundAccountAvatar`
4. `use-game-data` 在 Phigros 同步时从云存档 summary 取 avatar 名、从曲库取版本号；落雪同步时从 `player.presentation.iconId` 取头像
5. 头像 URL 写入 SQLite `resource_snapshots`，启动 restore 后通过 `hydrateBoundAccountAvatars` 回填非当前账号

## 期望输出

- Phigros / 落雪账号在切换页与游戏管理中显示玩家游戏内头像
- 其他查分器仍显示原有品牌图标

## 实际输出

- 已实现上述逻辑；单元测试覆盖 URL 构建规则
