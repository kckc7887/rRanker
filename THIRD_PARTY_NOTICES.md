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

The retained timing and audio scheduling utilities in
`apps/mobile/src/features/maimai-chart-preview/engine/` originate from the
`packages/maimai-chart-engine` package of **maimai-prober-frontend**
([Lxns-Network/maimai-prober-frontend](https://github.com/Lxns-Network/maimai-prober-frontend)),
including `core/timing/TimingTimeline.ts` and the Web Audio scheduler in
`core/audio/AudioManager.ts`. The preview event generation in AudioManager
is adapted to MajdataViewX semantics. Engine 目录内保留有上游 MIT
许可证副本（`engine/LICENSE`），根目录
`LICENSES/maimai-chart-engine-MIT.txt` 另存一份。

These retained portions are licensed under the MIT License, Copyright (c)
2026 Lxns-Network. `engine/LICENSE` applies to these portions, not to the
MajdataViewX / MajSimai adaptations described below.

## MajdataViewX chart-preview renderer and geometry

舞萌谱面确认的解析后数据准备、音符生命周期、皮肤变换、路径及动画曲线对照 **MajdataViewX**
（[re-poem/MajdataViewX](https://github.com/re-poem/MajdataViewX)）的
NoteDatas、Updaters、Shader、SkinManager、TimeProvider 和 SlideUtils，由 rRanker
于 2026-09-05 移植为 TypeScript / Canvas 2D。覆盖 `engine/renderers/frame.ts`、
`MainRenderer.ts`、`effects.ts`、`effectCurves.generated.ts`、`skinSemantics.ts`、
`engine/core/geometry/`、`core/timing/ScrollTimeline.ts`、`utils/arcadeMotion.ts`
以及正解音事件生成。修改包括确定性时刻重建、Canvas 坐标转换、S3 资源映射及桥接接入。
特效使用原始 PNG、Prefab 层级、动画曲线和粒子参数；烟花的
`MaimaiColorEffect.shader` 语义移植为 Canvas 颜色贴图及径向遮罩。
这些上游特效素材与源文件副本位于 `scripts/maimai-reference/Effects/`，版权归
MajdataViewX contributors，按项目 GPL-3.0 保留；不是项目所有者自行绘制的 S3 皮肤。
运行时八张特效 PNG 编码在 `engine/renderers/effectSprites.generated.ts`，随播放器加载。
修改包括按谱面时间重建色相、512 像素烟花着色缓存和 128 段径向渐变采样；
Canvas 与 Unity 的采样/混合仍需实际画面对照。

七个原始 C# 几何文件原样保存在 `apps/mobile/scripts/maimai-reference/ViewX/`，
仅用于独立对照与生成路径数据，未作为 Unity 运行时打包。原始文件版权归
MajdataViewX contributors；副本的路径与 SHA-256 见该目录上层 `sources.json`。
生成工具、对照程序和使用方法一并提供，见 `scripts/maimai-reference/README.md`。

MajdataViewX is licensed under the GNU General Public License v3.0. Per
GPL-3.0 §5 the adapted files keep source and modification notices. The GPL
portions retain GPL terms; the combination with this AGPL project is governed
by GPL/AGPL §13, including the AGPL network-interaction source requirements
for the combination. A copy of the license is included at
`LICENSES/MajdataViewX-GPL-3.0.txt`.

## MajSimai 2.2.2 parser

`engine/core/parser/SimaiParser.ts` is a TypeScript adaptation of **MajSimai**,
Copyright bbben, Lezi, Moying, GPL-3.0-or-later. ViewX's NuGet package
`Lingfeng-bbben.MajSimai.2.2.2` pins repository commit
`334f3b4141cbc204814bccb9f3e1cea7c1b14594` of
[LingFeng-bbben/MajSimai](https://github.com/LingFeng-bbben/MajSimai).
Modifications by rRanker on 2026-09-05: canonical note model, source diagnostics,
millisecond timing, LXNS difficulty/Buddy slots and browser integration.
The source archive is pinned by SHA-256 in `scripts/maimai-reference/bootstrap.mjs`;
the independent C# reference compiles that original source. The source checkout
is local build data, not a runtime dependency. License text is provided in
`LICENSES/MajSimai-GPL-3.0.txt`; the GPL portions retain their terms in the AGPL
combination. No MajdataPlay source is copied into the runtime.

## Maimai preview skin artwork and corresponding source

The 147 skin PNGs at the rRanker S3 chart-preview endpoint are user-authored
artwork, as declared by the project owner. Their normalized filenames do not
transfer copyright from MajdataViewX. `maimai-chart-preview-skin-manifest.generated.ts`
records each object's dimensions, alpha bounds, hash and URL; `skinSemantics.ts`
records the local naming correction. Online objects are not renamed or overwritten.
`answer.wav` is the owner-supplied preview sound at the same endpoint; this notice
does not claim authorship of that sound.

The corresponding source for the player includes the TypeScript sources,
generated data, generators, independent reference harness, notices and build
scripts in this repository. Anyone distributing a modified build or operating
a network-interactive version must make its corresponding modified source
available under the applicable terms, including [AGPL §13](https://www.gnu.org/licenses/agpl.en.html#section13).
The local `refer/` directory is not a substitute for providing corresponding source.

## Phigros / Phira chart-preview player core (phira)

Phigros/Phira 谱面确认 WebView 播放器
（`apps/mobile/src/features/phigros-chart-preview/webview-player/`）的谱面
解析、渲染与打击音语义移植自 **phira**
（[TeamFlos/phira](https://github.com/TeamFlos/phira)）的 `prpr` 核心：
`pgr-core.ts`（PGR 解析）、`renderer.ts`（PGR Canvas 渲染）、
`hit-sound.ts`（打击音分配）、`main.ts`（谱面解析与渲染组装部分），以及
`rpe-core.ts` / `rpe-renderer.ts` 的 RPE 路径语义；
`rpe-preset-shaders.ts` 内嵌 prpr 内置后处理特效预设（GLSL）源码。

phira is licensed under the GNU General Public License v3.0. The covered
code above is a TypeScript semantic port/rewrite integrated with rRanker's
WebView player architecture; the preset shader sources are embedded
verbatim with upstream attribution comments preserved where applicable
(e.g. godotshaders.com). Per GPL-3.0 §5 the files keep the license notice
and state the changes; GPLv3 code may be combined into this AGPL-3.0
project as a whole under AGPL-3.0 (FSF compatibility rules). A copy of
the license is included at `LICENSES/phira-GPL-3.0.txt`.

## RPE parsing & rendering semantics (PhiZone/player)

`rpe-core.ts`（缓动表、速度高度积分、事件插值）与 `rpe-renderer.ts`
（判定线/音符/演出层渲染）的 RPE 语义同时对照 **PhiZone Player**
（[PhiZone/player](https://github.com/PhiZone/player)）的 `utils.ts` /
`Line.ts` / `PlainNote.ts` / `LongNote.ts` / `Video.ts` / `Game.ts` /
`ShaderPipeline.ts` 移植。

PhiZone/player is licensed under the Mozilla Public License, v. 2.0. Its
source files carry no Exhibit B notice, so per MPL §3.3 the covered
portions may additionally be provided under AGPL-3.0 as a Secondary
License within this project. The derived files carry source-form license
notices in their headers (with the Exhibit A text available here and at
`LICENSES/player-MPL-2.0.txt`):

> This Source Code Form is subject to the terms of the Mozilla Public
> License, v. 2.0. If a copy of the MPL was not distributed with this
> file, You can obtain one at http://mozilla.org/MPL/2.0/.

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
