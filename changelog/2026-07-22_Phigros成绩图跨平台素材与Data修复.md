# Phigros 成绩图跨平台素材与 Data 修复

## 改动原因

此前的桌面 HTTP 预览没有覆盖 iOS 与 Android WebView 的真实资源加载方式。实机生成图片中，参考模板字体、头像、课题模式图、评价图和 Data 图标都因 Expo 本地资源 URI 无法被 HTML 读取而缺失；同时 `user`、`gameProgress` 被错误要求版本字节必须为 `1`，导致部分真实存档的头像信息和 Data 无法解析。

## 具体实现

- 将参考项目的全部字体、头像、课题模式图、评价图、Data 图标和兜底背景读取为 Base64，并以 `data:` URI 直接内嵌到 HTML/CSS，不再依赖 iOS 或 Android 的本地文件 URI 规则。
- 保留 CSS 文件的 Expo Asset 读取，并为 Android release 的原生资源标识补充与舞萌成绩图一致的缓存文件解析路径。
- `user` 与 `gameProgress` 只跳过各自的首个格式字节，不再要求该字节固定为 `1`；`gameRecord` 的既有严格版本校验保持不变。
- 补充存档测试，覆盖非 `1` 格式字节下的头像、背景曲目与 Data 解析；补充页面测试，断言最终 HTML 使用内嵌头像和评价图且不含参考素材 `file://` 地址。

## 期望输出

- iOS 与 Android 的预览和最终 PNG 均显示参考项目原字体、玩家头像、课题模式图、评价图片与 Data 图标。
- 玩家存档中存在有效 `gameProgress` 时显示真实 Data，不再因首字节不同而恒为 `0KiB`。
- 两个平台采用同一套内嵌资源方案，不再维护平台专属的素材加载分支。

## 实际输出

- TypeScript 类型检查通过。
- ESLint 通过，无新增错误；仍有 6 条既有 warning。
- Vitest 67 个测试文件、330 个测试全部通过；Jest 21 个测试套件、95 个测试全部通过。
- iOS 与 Android Expo 导出分别成功，参考项目字体、头像、课题模式图、评价图和 Data 图标均进入各自资源清单。
- 自动化 HTML 验证确认头像与评价图使用 `data:image/png;base64`，且参考素材不再包含 `file://` 地址；实机最终成图仍需安装本次构建后复核。
