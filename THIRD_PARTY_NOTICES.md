# Third-party notices

## phi-plugin B30 resource templates

The Phigros score-image renderer in
`apps/mobile/src/features/phigros-best-image/build-phigros-best-image-html.ts`
uses the `resources/html/b19` DOM/CSS contract from **phi-plugin**. The original
`b19`, `common` and `otherimg` files are copied without content changes into
`apps/mobile/assets/phigros-b30-reference` (the `HIMALAYA.TTF` filename is
changed to lowercase `.ttf` solely for Metro asset resolution).

Those resource templates are licensed under the Apache License, Version 2.0.
The Best30 visual shown by the upstream README is credited there to Steve
([@S-t-e-v-e-e](https://github.com/S-t-e-v-e-e)).
The rRanker integration replaces only the upstream template engine and data
model, resolves the original fonts and PNG files through Expo Asset, adds the
existing preview/export protocol, and uses rRanker branding. The original CSS,
font files, challenge badges, rating images and fallback artwork are used
directly.

Copyright remains with the original phi-plugin resource contributors. A copy
of the applicable license is included at
`LICENSES/phi-plugin-resources-APACHE-2.0.txt`.

No GPL-licensed phi-plugin application or business-logic code is included in
this adaptation.
