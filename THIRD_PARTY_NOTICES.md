# Third-party notices

## phi-plugin B30 resource templates

The Phigros score-image renderer in
`apps/mobile/src/features/phigros-best-image/build-phigros-best-image-html.ts`
uses the `resources/html/b19` DOM/CSS contract from **phi-plugin**. The non-font
files from `b19`, `common`, `otherimg` and `avatar` are copied
without content changes into `apps/mobile/assets/phigros-b30-reference`.

Those resource templates are licensed under the Apache License, Version 2.0.
The Best30 visual shown by the upstream README is credited there to Steve
([@S-t-e-v-e-e](https://github.com/S-t-e-v-e-e)).
The rRanker integration replaces only the upstream template engine and data
model, resolves the PNG files through Expo Asset, and adds the existing
preview/export protocol. The original twelve font files are distributed as
individually compressed archives from
`https://rranker-phigros-data.cn-nb1.rains3.com/fonts/`, downloaded on demand,
and accepted only after their pinned archive and font hashes have been
verified. The original CSS, fonts, player avatars, challenge badges, rating
images, fallback artwork, footer structure and visual branding are used
directly.

Copyright remains with the original phi-plugin resource contributors. A copy
of the applicable license is included at
`LICENSES/phi-plugin-resources-APACHE-2.0.txt`.

No phi-plugin application source file is copied into the runtime. Save parsing,
Avg requests and template data binding are TypeScript adaptations integrated
with rRanker's existing providers.
