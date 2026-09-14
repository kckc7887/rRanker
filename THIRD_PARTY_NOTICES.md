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
`apps/mobile/src/features/simai-chart-preview/engine/` originate from the
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

The touch-region overlay `apps/mobile/assets/maimai-chart-preview/sensor.webp`
is the original bundled asset from maimai-prober-frontend, distinct from the
owner-authored S3 skins below. It is loaded through the shared preview staging
plan; the renderer calibrates its artwork center and scale without modifying
the image bytes.

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

## Majdata Net integration and MajdataPlay scoring reference

Majdata Net 接入按本地 `refer/MajdataNet` 的公开协议实现，使用
`https://majdata.net/api3/api`，游戏和来源图标使用用户指定的
`https://rranker.cn-nb1.rains3.com/assets/images/majdata.png`（1330×1330 PNG）。
玩家头像来自 Majdata Net 的公开 `account/Icon?username=` 接口。
应用没有复制该站点的页面代码或在线收藏功能。

`apps/mobile/scripts/maimai-reference/MajdataScoreReference.cs` 包含 MajdataPlay
`ObjectCounter.cs` 的 `UpdateNoteScoreCount` 原始方法，Copyright MajdataPlay contributors，
GPL-3.0。方法仅提升为 public，增加空类型以执行原始类型分派；来源和 SHA-256 见同目录
`majdata-source.json`，许可证副本见 `LICENSES/MajdataPlay-GPL-3.0.txt`。
此方法用于生成测试对照数据，不编入应用。应用的物量和双达成率计算对照该项目的实际规则。
Simai 解析、渲染和原有皮肤适配现由舞萌与 Majdata Net 共用，仍保留前述来源与许可证。

## Rizline cloud-save protocol and key unpacking (RizlineGameSaveData)

`apps/mobile/src/providers/rizline-provider.ts` adapts the login/save protocol and
packed-key reconstruction described and implemented by **CHCAT1320/RizlineGameSaveData**,
revision [`ba89227baa2927655ea884a849d6a27ea1cdfb2d`](https://github.com/CHCAT1320/RizlineGameSaveData/tree/ba89227baa2927655ea884a849d6a27ea1cdfb2d).
Sources are `getUser.py`, `gameDataAes2Json.py`, `README.md` and `API.md`.
The upstream repository supplies the GNU GPL version 3 license text, copied in full to
[`LICENSES/RizlineGameSaveData-GPL-3.0.txt`](LICENSES/RizlineGameSaveData-GPL-3.0.txt).
The upstream files do not state a separate program copyright line or an explicit
"or later" version grant; the unfilled example in the license appendix is not
an additional program copyright or version notice. Attribution remains with
CHCAT1320 and the upstream contributors.

Modifications by rRanker, 2026-09-14: TypeScript integration with the shared HTTP,
credential, cancellation and cache paths; SMS login; typed save validation; token
rotation; authenticated AES-GCM decryption through `@noble/ciphers`. The covered
adaptation retains the upstream license notices; the project's own license is
provided separately in the root `LICENSE`.

The same pinned upstream README also contains these statements, retained here
as upstream statements in addition to its GPL text:

> 该库只可用于游戏查分
>
> 禁止用该项目做不利于鸽游的事情，包括短信轰炸，频繁请求数据等
>
> 该项目与鸽游无关

This notice records both sources without treating the README statements as part
of the standard GPL text or resolving their relationship to it. The integration
is used for player login and score retrieval.

## Rizline AH compatibility calculation (rizline_b40_tool)

`apps/mobile/src/domain/rizline.ts` adapts the AH compatibility and best-group
calculation from **REDDRAGON-HL/rizline_b40_tool**,
[`rizb40_tool.js` at `93b2881d5cea7d53ac11706c028245ed144d8a16`](https://github.com/REDDRAGON-HL/rizline_b40_tool/blob/93b2881d5cea7d53ac11706c028245ed144d8a16/rizb40_tool.js).
The applicable license is Apache License, Version 2.0; its full, unchanged text is
[`LICENSES/rizline_b40_tool-APACHE-2.0.txt`](LICENSES/rizline_b40_tool-APACHE-2.0.txt).
The pinned repository has no separate `NOTICE` file or filled-in copyright line.
Source attribution remains with REDDRAGON-HL and the upstream contributors.

Modifications by rRanker, 2026-09-14: typed catalog/score inputs, explicit unknown
and inferred states, removal of the claim that an all-Riztime chart proves AH,
SP exclusion from best groups, stable chart identity/order, and incomplete-group
contributions. No upstream web UI, score-image layout or artwork is copied by
this adaptation. The Apache-covered portions retain their original terms within
the AGPL project; the Apache license does not apply to the entire Rizline module.

## Rizline full-completion numeric reference (RizlineSavingTest)

The AP regression in `apps/mobile/tests/rizline-domain.test.ts` uses the numeric
`completeRate` example from **HiXcc/RizlineSavingTest**,
[`RizScoreUploader.py` at `88b16f9f822972f9dc9ac18cefe7c8c555e9e7b8`](https://github.com/HiXcc/RizlineSavingTest/blob/88b16f9f822972f9dc9ac18cefe7c8c555e9e7b8/RizScoreUploader.py#L37).
That project is MIT-licensed, **Copyright (c) 2026 HiXcc**. The complete notice is
[`LICENSES/RizlineSavingTest-MIT.txt`](LICENSES/RizlineSavingTest-MIT.txt).
Only the public numeric format example is used; its score-upload code is neither
copied into nor executed by rRanker. The application reads scores and does not
provide an official score-upload operation.

## AES-GCM implementation (@noble/ciphers)

The Rizline save decoder imports `@noble/ciphers/aes.js` from **@noble/ciphers 2.4.0**,
maintained by [Paul Miller](https://github.com/paulmillr/noble-ciphers/tree/2.4.0).
The package is used without source changes. Its MIT license contains both
**Copyright (c) 2022 Paul Miller (https://paulmillr.com)** and
**Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>**.
The complete installed-package license, including both copyright lines, is
[`LICENSES/noble-ciphers-MIT.txt`](LICENSES/noble-ciphers-MIT.txt).

The independently maintained resource publisher records its own code references
and installed dependencies in
[`rizline_publisher-publish/THIRD_PARTY_NOTICES.md`](https://github.com/kckc7887/rizline_publisher-publish/blob/main/THIRD_PARTY_NOTICES.md).
Its references do not transfer third-party code licenses to game metadata or images.
