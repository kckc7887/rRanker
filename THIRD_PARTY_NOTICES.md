# Third-party notices

本文件说明 rRanker 中使用的第三方资源、移植代码与所依赖的网络服务，以及各自适用的许可证。项目整体采用 AGPL-3.0（见根目录 `LICENSE`），以下条目保留其原有版权与许可条件。

## phi-plugin B30 resource templates

The Phigros score-image renderer in
`apps/mobile/src/features/phigros-best-image/build-phigros-best-image-html.ts`
uses the `resources/html/b19` DOM/CSS contract from **phi-plugin**. The non-font
files from `b19`, `common` and `otherimg` are copied
without content changes into `apps/mobile/assets/phigros-b30-reference`.

phi-plugin 仓库采用双层许可证：仓库根 `LICENSE` 为 GPL-3.0，而 `resources/`
目录内附独立的 `resources/LICENSE`（Apache License, Version 2.0）。本项目的
B30 渲染仅使用其 `resources/` 下的模板资源（Apache-2.0），未复制 phi-plugin
的 GPL-3.0 应用源码。

Those resource templates are licensed under the Apache License, Version 2.0.
The Best30 visual shown by the upstream README is credited there to Steve
([@S-t-e-v-e-e](https://github.com/S-t-e-v-e-e)).
The rRanker integration replaces only the upstream template engine and data
model, resolves the PNG files through Expo Asset, and adds the existing
preview/export protocol. Player avatars are no longer bundled: they are loaded
at runtime from the rRanker Phigros object storage mirror of the official APK
resources (see `apps/mobile/src/domain/account-avatar.ts`), keyed by the
`metadata/tmp.tsv` mapping. The original twelve font files are distributed as
individually compressed archives from
`https://rranker-phigros-data.cn-nb1.rains3.com/fonts/`, downloaded on demand,
and accepted only after their pinned archive and font hashes have been
verified. The original CSS, fonts, challenge badges, rating images, fallback
artwork, footer structure and visual branding are used directly.

Copyright remains with the original phi-plugin resource contributors. A copy
of the applicable license is included at
`LICENSES/phi-plugin-resources-APACHE-2.0.txt`（与
`apps/mobile/assets/phigros-b30-reference/LICENSE` 内容一致）。

No phi-plugin application source file is copied into the runtime. Save parsing,
Avg requests and template data binding are TypeScript adaptations integrated
with rRanker's existing providers.

## maimai chart engine (maimai-prober-frontend)

The maimai chart preview engine at
`apps/mobile/src/features/maimai-chart-preview/engine/` is ported from the
`packages/maimai-chart-engine` package of **maimai-prober-frontend**
([Lxns-Network/maimai-prober-frontend](https://github.com/Lxns-Network/maimai-prober-frontend)),
including its `core/parser`（Simai/Ma2 解析）、`core/timing`、
`core/audio`、`renderers` 与 `utils` 结构。Engine 目录内保留有上游 MIT
许可证副本（`engine/LICENSE`），根目录
`LICENSES/maimai-chart-engine-MIT.txt` 另存一份。

The engine is licensed under the MIT License, Copyright (c) 2026 Lxns-Network.
The surrounding preview feature (chart loading, audio wiring, gesture
rendering) is rRanker's own implementation.

## nonebot-plugin-maimaidx / maimaiDX best-image layout

The "game 样式" B50 export in
`apps/mobile/src/features/best-image/build-best-image-html.ts` 的贴图布局
（难度配色、评价/FC/FS 角标、玩家信息卡与底部署名结构）对齐
**nonebot-plugin-maimaidx**
([Yuri-YuzuChaN/nonebot-plugin-maimaidx](https://github.com/Yuri-YuzuChaN/nonebot-plugin-maimaidx))
及其同族项目 **maimaiDX**
([Yuri-YuzuChaN/maimaiDX](https://github.com/Yuri-YuzuChaN/maimaiDX)) 的
B50 原版绘图布局（二者均为同一作者的 HoshinoBot/NoneBot2 版本）。
导出的 HTML 输出保留了上游署名 "Designed by Yuri-YuzuChaN & BlueDeer233"。

Both projects are licensed under the MIT License: nonebot-plugin-maimaidx
Copyright (c) 2023 柚子（副本见
`LICENSES/nonebot-plugin-maimaidx-MIT.txt`），maimaiDX Copyright (c) 2021
Yuri-YuzuChaN（副本见 `LICENSES/maimaiDX-MIT.txt`）。
本项目的成绩图仅复用布局与视觉契约，绘制引擎、数据绑定与导出链路均为
rRanker 自身实现。

## maimai-score-hub (network service)

rRanker 的舞萌DX 数据同步通过
`apps/mobile/src/services/score-hub-client.ts` 调用
[maimai-score-hub](https://github.com/bakapiano/maimai-score-hub) 公开的
Friend VS / DXNet 同步 API。该仓库未附带许可证文件，rRanker 仅按其
公开网络协议进行 API 交互，未复制或改编其任何源码；如对服务条款有疑问，
请以服务方声明为准。

## DXRating (network service)

rRanker 的舞萌DX 谱面标签（`dxrating-chart-tags`）来源于
[gekichumai/dxrating](https://github.com/gekichumai/dxrating)（MIT License）
公开的 `https://miruku.dxrating.net/api/v1/tags` 接口数据。
rRanker 仅消费其公开 API 数据并本地缓存，未复制其源码。
