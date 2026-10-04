#!/usr/bin/env bash
set -uo pipefail
cd "${GITHUB_WORKSPACE:-.}" || exit 1
paths_file="$(mktemp)" || exit 1
trap 'rm -f "$paths_file"' EXIT

functional=true
reason=no-base
count=0
head="${SCOPE_INPUT_HEAD:-$(git rev-parse --verify HEAD 2>/dev/null)}"
base="${SCOPE_INPUT_BASE:-}"
if [ -z "$base" ]; then
  case "${SCOPE_EVENT_NAME:-}" in
    push) base="${SCOPE_PUSH_BEFORE:-}" ;;
    pull_request) base="${SCOPE_PR_BASE:-}" ;;
  esac
fi

if [ -n "$head" ] && [ -n "$base" ] && [ "$base" != 0000000000000000000000000000000000000000 ]; then
  if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    git fetch --depth=1 --no-tags origin "$base" >/dev/null 2>&1 || true
  fi
  if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    reason=base-unavailable
  # 改名同时检查新旧路径，避免源码移入文档目录后被跳过。
  elif ! git diff --name-only --no-renames -z "$base" "$head" > "$paths_file" 2>/dev/null; then
    reason=diff-failed
  else
    functional=false
    reason=docs-only
    while IFS= read -r -d '' path; do
      count=$((count + 1))
      case "$path" in
        *.md | LICENSE | LICENSES/* | docs/* | assets/images/*) ;;
        *) functional=true; reason=functional ;;
      esac
    done < "$paths_file"
    if [ "$count" -eq 0 ]; then reason=no-changes; fi
  fi
fi

{
  echo "functional=$functional"
  echo "reason=$reason"
  echo "changed-count=$count"
} >> "${GITHUB_OUTPUT:-/dev/null}"
echo "变更范围：$reason，文件数：$count"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "变更范围：$reason，文件数：$count；完整检查：$functional" >> "$GITHUB_STEP_SUMMARY"
fi
