# 2026-07-11 统一归档 Demo 与经验总结

## 改动原因

水鱼、微信公众号爬虫和 WebUI 代理概念验证散落在仓库顶层，既干扰正式移动端目录，也容易让历史 PoC 被误认为生产实现。需要把所有现存 Demo 统一放入本地归档目录、默认从 Git 排除，并保留一份可持续维护的经验总结。

## 具体实现

- 将 `diving-fish-demo/` 移至 `demo/diving-fish-demo/`。
- 将 `wechat-crawler-demo/` 移至 `demo/wechat-crawler-demo/`。
- 将 `webui-proxy-demo/` 移至 `demo/webui-proxy-demo/`。
- `.gitignore` 忽略 `demo/*`，仅例外跟踪 `demo/README.md`。
- 新增 `demo/README.md`，总结：
  - 水鱼、落雪、微信抓取、Go 单程序和 WebUI 代理验证结果。
  - 已验证与未验证边界。
  - OAuth/WFP/证书/代理恢复/临时目录/打包经验。
  - 成绩字段、封面 ID、B50 与隐私注意事项。
  - Demo 向正式 fixture、provider 和移动端代码迁移的规则。
- 更新 `README.md` 的目录说明与经验总结入口。
- 更新 `ROADMAP.md` 中本地样例路径。

## 期望输出

- 仓库顶层不再出现多个 `*-demo` 目录。
- Demo 代码和真实输出不再进入 Git 状态。
- `demo/README.md` 继续受版本控制，保留验证结论和复用边界。
- 新 Demo 有统一归档规则，不再污染正式产品目录。

## 实际输出

- 三个现存 Demo 已迁入统一目录，仓库顶层 `*-demo` 目录数量为 0。
- 共核对 13 个原受跟踪 Demo 文件，新位置文件与迁移前 Git blob 哈希完全一致，差异数为 0。
- `demo/diving-fish-demo/`、`demo/wechat-crawler-demo/`、`demo/webui-proxy-demo/` 均已被 Git 忽略；`demo/README.md` 未被忽略。
- 7 个 Python 文件均通过 `ast.parse` 语法检查。
- Git 忽略规则、README、ROADMAP 与经验总结已同步更新，`git diff --check` 通过。
