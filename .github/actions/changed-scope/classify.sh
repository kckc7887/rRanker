#!/usr/bin/env bash
#
# 变更范围判定：把一次比较的改动分成“影响应用功能”与“只落在自述文件、文档、许可声明、README 截图与 CI 流程”。
#
# 输出（写进 GITHUB_OUTPUT，全部是固定枚举或数字）：
#   functional    true/false，无法判定时一律为 true
#   reason        固定枚举：no-base | base-unavailable | diff-failed | no-changes | docs-only | functional
#   changed-count 本次比较的变更文件数量
#
# 路径原文不进入 GITHUB_OUTPUT：文件名可以含换行、回车、制表符与 ESC，
# 直接拼进 key=value 会伪造工作流注解行或注入额外输出键。
# 路径只出现在日志与 job summary，且写入前先转义控制字符、再做 HTML 转义。
#
# 环境变量：GITHUB_WORKSPACE、GITHUB_OUTPUT、GITHUB_STEP_SUMMARY、SCOPE_EVENT_NAME、
#           SCOPE_PUSH_BEFORE、SCOPE_PR_BASE、SCOPE_INPUT_BASE、SCOPE_INPUT_HEAD
#
# 故意不开 set -e：判定必须始终写出 functional/reason/changed-count 三个输出，
# 取不到基准、比较失败等异常都在下面显式处理并退化为“按有功能改动处理”，
# 而不是中途退出、留下空的判定结果。
set -uo pipefail

if ! cd "${GITHUB_WORKSPACE:-.}"; then
  echo "::error::轻检查无法进入工作目录 ${GITHUB_WORKSPACE:-.}"
  exit 1
fi

paths_file="$(mktemp)" || {
  echo "::error::轻检查无法创建临时文件"
  exit 1
}
trap 'rm -f "$paths_file"' EXIT

reason_no_base=no-base
reason_base_unavailable=base-unavailable
reason_diff_failed=diff-failed
reason_no_changes=no-changes
reason_docs_only=docs-only
reason_functional=functional
null_sha=0000000000000000000000000000000000000000

# 控制字符转义：避免含换行的文件名在日志里伪造工作流注解行（::error:: 之类）
escape_control() {
  local value=$1
  value=${value//$'\r'/\\r}
  value=${value//$'\n'/\\n}
  value=${value//$'\t'/\\t}
  value=${value//$'\e'/\\e}
  printf '%s' "$value"
}

# HTML 转义：路径写进 job summary 的 <pre> 里，避免文件名闭合标签或插入标记。
# 替换串里的 & 在 bash 模式替换中是“匹配到的内容”，必须写成 \& 才是字面量。
escape_html() {
  local value=$1
  value=${value//&/\&amp;}
  value=${value//</\&lt;}
  value=${value//>/\&gt;}
  printf '%s' "$value"
}

# 只有自述文件、文档、许可声明、README 截图与 CI 流程算与应用功能无关
non_functional() {
  case "$1" in
    README.md | */README.md | AGENTS.md | */AGENTS.md | CLAUDE.md | */CLAUDE.md) return 0 ;;
    LICENSE | LICENSES/* | THIRD_PARTY_NOTICES.md) return 0 ;;
    docs/* | .github/* | assets/images/*) return 0 ;;
  esac
  return 1
}

functional=true
reason="$reason_no_base"
count=0

head="${SCOPE_INPUT_HEAD:-}"
if [ -z "$head" ]; then
  head="$(git rev-parse --verify HEAD 2> /dev/null || true)"
fi

base="${SCOPE_INPUT_BASE:-}"
if [ -z "$base" ]; then
  case "${SCOPE_EVENT_NAME:-}" in
    push) base="${SCOPE_PUSH_BEFORE:-}" ;;
    pull_request | pull_request_target) base="${SCOPE_PR_BASE:-}" ;;
  esac
fi

if [ -z "$head" ] || [ -z "$base" ] || [ "$base" = "$null_sha" ]; then
  echo "轻检查：本次事件拿不到比较基准，按有功能改动处理"
else
  # 基准提交不在本地时只取它自己，避免为一次轻检查拉取完整历史
  if ! git cat-file -e "${base}^{commit}" 2> /dev/null; then
    git fetch --depth=1 --no-tags origin "$base" > /dev/null 2>&1 || true
  fi
  if ! git cat-file -e "${base}^{commit}" 2> /dev/null; then
    reason="$reason_base_unavailable"
    echo "::warning::轻检查取不到基准提交 $(escape_control "$base")，按有功能改动处理"
  # --no-renames：改名同时列出新旧路径，避免功能文件被改名藏进文档路径
  elif ! git diff --name-only --no-renames -z "$base" "$head" > "$paths_file" 2> /dev/null; then
    reason="$reason_diff_failed"
    echo "::warning::轻检查无法比较 $(escape_control "$base") 与 $(escape_control "$head")，按有功能改动处理"
  else
    functional=false
    reason="$reason_docs_only"
    while IFS= read -r -d '' path; do
      count=$((count + 1))
      if [ "$functional" = false ] && ! non_functional "$path"; then
        functional=true
        reason="$reason_functional"
      fi
    done < "$paths_file"
    if [ "$count" -eq 0 ]; then
      reason="$reason_no_changes"
    fi
  fi
fi

{
  echo "functional=$functional"
  echo "reason=$reason"
  echo "changed-count=$count"
} >> "${GITHUB_OUTPUT:-/dev/null}"

if [ "$functional" = false ]; then
  echo "轻检查：$count 个改动都落在自述文件、文档、许可声明、README 截图与 CI 流程"
  while IFS= read -r -d '' path; do
    echo "  改动：$(escape_control "$path")"
  done < "$paths_file"
else
  echo "轻检查：需要完整检查（$reason）"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### 轻检查"
    echo
    if [ "$functional" = false ]; then
      echo "改动只落在自述文件、文档、许可声明、README 截图与 CI 流程，跳过质量检查与构建。"
    else
      echo "存在影响应用功能的改动，继续完整检查。"
    fi
    echo
    echo "- 判定依据：\`$reason\`"
    echo "- 变更文件数：$count"
    if [ "$count" -gt 0 ]; then
      echo
      echo "变更文件："
      echo
      echo "<pre>"
      while IFS= read -r -d '' path; do
        echo "$(escape_html "$(escape_control "$path")")"
      done < "$paths_file"
      echo "</pre>"
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi
