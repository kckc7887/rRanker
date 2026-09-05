# 舞萌独立参考程序

此程序以 .NET 9 编译原始 C#，用于校验 TypeScript 输出，不引用 TypeScript 实现。
普通应用构建只消费已生成的数据，不需要 .NET、Unity、网络或 `refer/`。

`ViewX/` 七个 C# 文件来自本地 MajdataViewX-master，内容未修改，原始位置和 SHA-256
见 `sources.json`；许可证副本为 `LICENSE`（GPL-3.0）。`Program.cs` 提供 JSON 导出和
无行为的 `Unity.Burst.BurstCompileAttribute` 编译占位；不模拟 Unity 渲染。

MajSimai 来源为 ViewX NuGet 清单锁定的 2.2.2 / `334f3b4141cbc204814bccb9f3e1cea7c1b14594`。
NuGet 声明作者 bbben、Lezi、Moying，GPL-3.0-or-later；对应许可证文本见
仓库根 `LICENSES/MajSimai-GPL-3.0.txt`。原源码工程自身的版本字符串为 2.1.1，
锁定身份以 NuGet 的仓库 commit 为准。bootstrap 校验完整 ZIP 的 SHA-256 后才解压
Runtime 到被忽略的 `build/`，不会写入 `refer/`。

在 `apps/mobile` 执行：

```powershell
node scripts/maimai-reference/bootstrap.mjs
dotnet run --project scripts/maimai-reference/Reference.csproj -- parse tests/fixtures/maimai-simai-cases.json build/maimai-reference/simai-check.json
dotnet run --project scripts/maimai-reference/Reference.csproj -- customcases tests/fixtures/maimai-custom-cases.json build/maimai-reference/custom-check.json
dotnet run --project scripts/maimai-reference/Reference.csproj -- connected tests/fixtures/maimai-connected-cases.json build/maimai-reference/connected-check.json
dotnet run --project scripts/maimai-reference/Reference.csproj -- geometry build/maimai-reference/geometry.json
node scripts/generate-maimai-geometry.mjs
```

对照 `*-check.json` 和 `tests/fixtures/maimai-*-reference.json`，不要用 TypeScript
生成预期结果。新增用例时才通过上述原始 C# 输出扩充对应 fixture，并审查差异。
`maimai-chart-preview-reference.test.ts` 比较每个音符的时间和属性，以及自定义、连接路径。
原始编译产物和 ZIP 全部留在 `build/`。

`Effects/` 保存原始动画、Prefab、Shader、材质和特效 PNG/导入参数，来源和哈希
同样记录在 `sources.json`。它们沿用 MajdataViewX 的 GPL 许可，不属于用户的 S3 皮肤。
`node scripts/generate-maimai-effects.mjs` 从这些文件提取六个动画、四组层级、八张
运行时特效贴图和 HOLD 粒子曲线。它使用当前 npm 安装中已验证存在的 `yaml` 模块，
无需 `refer/`。生成物带来源和修改声明；对照数据不证明 Canvas 与 Unity 画面相同。

参考快照、生成数据与移植部分保留 GPL 条款；rRanker 的整合代码按仓库 AGPL 条款提供。
参见根目录 `THIRD_PARTY_NOTICES.md` 的修改说明和组合许可说明。
