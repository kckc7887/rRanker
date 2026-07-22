# XING-MISS 筛选忽略 FC 曲

## 改动原因

XING-MISS 表示落下 1 个 Miss，必断连击；Acc 偶然重合的 FC 曲不应进入该筛选结果。

## 具体实现

`matchesXingFilter`：当 `xing === 'miss'` 且 `record.fc === 'ap'` 时直接排除。

## 期望输出

- XING-MISS 结果不含 FC 曲。
- XING-GOOD 不受影响。

## 实际输出

- Vitest：`phigros-best-image` 中 FC 同 Acc 曲被 Miss 筛选忽略。
