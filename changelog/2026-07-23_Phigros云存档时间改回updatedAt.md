# Phigros 云存档时间改回 LeanCloud updatedAt

## 改动原因

总览「TapTap云存档」此前显示 App 本地拉取时刻，与「存档何时在云端更新」语义不符；同步成功但云端未变时时间仍会刷新，容易误解成绩已更新。产品只需展示云存档 `updatedAt`。

## 具体实现

1. **`phigros-score-provider.ts`**：移除 `lastFetchedAt` / `getSyncedAt()`；`source.updatedAt` 与 `getSaveUpdatedAt()` 均使用 LeanCloud 存档 `updatedAt`。
2. **`use-game-data.ts`**：成绩来源时间改为 `getSaveUpdatedAt()`；查询版本升至 16。

## 期望输出

「TapTap云存档」与成绩图同步时间均为云端存档更新时间；本地再次同步若云端未变，该时间不变。

## 实际输出

UI 时间与 LeanCloud `updatedAt` 对齐；不再写入本地拉取时刻。
