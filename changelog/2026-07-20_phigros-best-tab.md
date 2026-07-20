# 填充 Phigros 最佳页

## 改动原因

Phigros 已具备 Phi3 / Best27 数据，但「最佳」Tab 仅服务舞萌，Phigros 显示空状态。

## 具体实现

- `b50/index.tsx` 拆分舞萌与 Phigros：`Phi3`、`Best27` 分区列表
- 使用 `PhigrosScoreCard`、曲库曲名、TapTap/曲库数据状态
- Phi3 按定数排序，Best27 按 RKS 排序；卡片支持名次前缀
- `game-profile` 最佳分区改为 Phi3 + Best27
- 新增 `phigros-best.test.tsx`

## 期望输出

绑定 TapTap 后最佳页展示 Phi3（最多 3）与 Best27（最多 27）成绩卡。

## 实际输出

- 页面与单测已实现；269 单元测试 + m4 UI 测试通过
