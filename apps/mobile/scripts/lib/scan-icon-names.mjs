// 扫描 app/ 与 src/ 中 Ionicons 图标名使用，供子集化与守卫测试共用。
// 白名单机制：遇到无法静态解析的 name 表达式直接抛错，防止子集漏收图标。
import fs from 'node:fs';
import path from 'node:path';

const LITERAL = /^['"]([a-z0-9-]+)['"]$/;
// 三元：任意条件 + 两个字面量分支（分支必须为字面量，嵌套三元需拆分）
const TERNARY = /^(.{1,160}?)\?\s*['"]([a-z0-9-]+)['"]\s*:\s*['"]([a-z0-9-]+)['"]\s*$/s;
// 纯变量/成员引用（如 meta.icon）：值必须来自同文件的 `icon: 'x'` 字面量映射（下方一并收集）
const VARIABLE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

/** 收集单个文件内的 Ionicons 图标名；返回名称数组，发现动态表达式时抛错。 */
export function collectIoniconNamesFromFile(filePath, content) {
  const names = [];
  const push = (raw, where) => {
    const value = raw.trim();
    const literal = LITERAL.exec(value);
    if (literal) {
      names.push(literal[1]);
      return;
    }
    const ternary = TERNARY.exec(value);
    if (ternary) {
      names.push(ternary[2], ternary[3]);
      return;
    }
    if (VARIABLE.test(value)) {
      // 动态变量引用：不收集名称本身，但其字面量来源必须由同文件 `icon: 'x'` 收集覆盖，
      // 否则守卫测试会因清单缺项而失败
      return;
    }
    throw new Error(
      `${filePath}: 无法静态解析的 Ionicons name 表达式 ${where}: ${value.slice(0, 100)}` +
        '（子集化要求 name 为字面量或字面量三元；动态图标名请改为字面量三元后重跑 scripts/subset-ionicons.mjs）',
    );
  };

  // <Ionicons ... name={...} / name="..."（name 属性必须在首个嵌套花括号之前的属性区内）
  let tagCount = 0;
  const tagPattern = /<Ionicons\b((?:[^>{}]|\{[^{}]*\})*)>/g;
  for (const tag of content.matchAll(tagPattern)) {
    tagCount += 1;
    const attrs = tag[1];
    const nameAttr = /name\s*=\s*("[^"]*"|'[^']*'|\{[^{}]*\})/.exec(attrs);
    if (!nameAttr) continue;
    let raw = nameAttr[1];
    if (raw.startsWith('{') && raw.endsWith('}')) raw = raw.slice(1, -1);
    push(raw, `(${tag[0].slice(0, 70).replace(/\s+/g, ' ')}...)`);
  }
  // 每出现一个 <Ionicons 标签都应能被属性正则覆盖；若有标签因复杂属性漏匹配则强制人工确认
  const occurrences = [...content.matchAll(/<Ionicons\b/g)].length;
  if (occurrences !== tagCount) {
    throw new Error(
      `${filePath}: 检测到 ${occurrences} 处 <Ionicons 标签但仅解析 ${tagCount} 处（属性含嵌套花括号），请拆分该标签属性后重试`,
    );
  }

  // icon: 'x' 对象字面量（AppNotification meta 映射等，最终作为 name 传入）
  for (const m of content.matchAll(/\bicon\s*:\s*['"]([a-z0-9-]+)['"]/g)) {
    names.push(m[1]);
  }
  return names;
}

/** 递归收集目录下全部 Ionicons 图标名（app/ 与 src/）。 */
export function collectIoniconNames(projectRoot) {
  const dirs = ['app', 'src'].map((d) => path.join(projectRoot, d));
  const names = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        for (const name of collectIoniconNamesFromFile(full, content)) names.add(name);
      }
    }
  };
  dirs.forEach(walk);
  return [...names].sort();
}
