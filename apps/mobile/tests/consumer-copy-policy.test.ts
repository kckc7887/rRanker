import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  ProviderError,
  providerErrorToUserMessage,
} from '@/providers/errors';

const SOURCE_ROOTS = ['app', 'src', 'scripts'] as const;
const COMMENT_ROOTS = [...SOURCE_ROOTS, 'tests'] as const;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const COPY_PROPERTY_NAMES = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'description',
  'detail',
  'emptyText',
  'errorText',
  'exportIdleLabel',
  'label',
  'loadingText',
  'message',
  'placeholder',
  'prepareErrorFallback',
  'statusText',
  'subtitle',
  'title',
]);
const FORBIDDEN_COPY = [
  /SecureStore|SQLite|Session Token|Access Token|Import-Token|PKCE|WebView|Provider|Schema/iu,
  /快照|轮询|上游|响应结构|缓存命中|缓存优先|本地页面|数据状态/u,
  /HTTP\s*(?:状态|[1-5]\d{2})/iu,
  /不含系统|不含成绩|不会保存|仅保存在|仅使用内存|恢复账号同步|应用内快照|数据来源/u,
];
const FORBIDDEN_COMMENT = [
  /改造前|改造后|原实现|旧实现|旧行为|历史行为/u,
  /逐字保留|保持原值|原值不变|薄包装|薄兼容|收敛|兼容层|调用方零改动/u,
  /此前|教训/u,
  /三屏原值|各屏原|原值|逐字一致|零变化|既有调用方|本次已授权/u,
  /有意视觉变更|重构漂移|用户要求|P[0-9]\s*(?:store|工厂|回归|收敛)/iu,
];

type Finding = { file: string; line: number; text: string; reason: string };

function collectFiles(roots: readonly string[], extensions: ReadonlySet<string>): string[] {
  const files: string[] = [];
  const visit = (entryPath: string) => {
    for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
      const fullPath = path.join(entryPath, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
    }
  };
  roots.forEach((root) => visit(path.resolve(root)));
  return files;
}

function sourceFileFor(filePath: string, source: string): ts.SourceFile {
  const extension = path.extname(filePath);
  const kind = extension === '.tsx'
    ? ts.ScriptKind.TSX
    : extension === '.jsx'
      ? ts.ScriptKind.JSX
      : extension === '.js' || extension === '.mjs' || extension === '.cjs'
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
}

function propertyNameText(name: ts.PropertyName | ts.JsxAttributeName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function lineText(source: string, position: number): string {
  const start = source.lastIndexOf('\n', position - 1) + 1;
  const end = source.indexOf('\n', position);
  return source.slice(start, end < 0 ? source.length : end).trim();
}

function matchingRule(value: string, rules: readonly RegExp[]): RegExp | null {
  return rules.find((rule) => rule.test(value)) ?? null;
}

function addCopyFinding(
  findings: Finding[],
  filePath: string,
  sourceFile: ts.SourceFile,
  source: string,
  position: number,
  value: string,
): void {
  const rule = matchingRule(value, FORBIDDEN_COPY);
  if (!rule) return;
  findings.push({
    file: path.relative(process.cwd(), filePath),
    line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
    text: lineText(source, position),
    reason: rule.source,
  });
}

function literalValue(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('');
  }
  return null;
}

function isTextElement(node: ts.JsxElement): boolean {
  return node.openingElement.tagName.getText() === 'Text';
}

function isRawErrorValue(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') {
    return /error/iu.test(node.expression.getText());
  }
  return ts.isCallExpression(node)
    && node.expression.getText() === 'String'
    && node.arguments.some((argument) => /error/iu.test(argument.getText()));
}

function hasUserVisibleAncestor(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxExpression(current)) return true;
    if (ts.isPropertyAssignment(current) && COPY_PROPERTY_NAMES.has(propertyNameText(current.name) ?? '')) {
      return true;
    }
    if (ts.isBinaryExpression(current)
      && current.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(current.left)
      && ['innerText', 'textContent'].includes(current.left.name.text)) {
      return true;
    }
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText();
      if (/^(?:set.*(?:Error|Message|Status)|showActionNotification|showNotification)$/u.test(callee)) return true;
    }
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) return false;
  }
  return false;
}

function scanSourceCopy(filePath: string): Finding[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = sourceFileFor(filePath, source);
  const findings: Finding[] = [];

  const visit = (node: ts.Node, insideText = false) => {
    const nextInsideText = insideText || (ts.isJsxElement(node) && isTextElement(node));
    if (ts.isJsxText(node) && nextInsideText) {
      addCopyFinding(findings, filePath, sourceFile, source, node.getStart(sourceFile), node.text);
    }
    if (nextInsideText) {
      const value = literalValue(node);
      if (value !== null) addCopyFinding(findings, filePath, sourceFile, source, node.getStart(sourceFile), value);
    }
    if (ts.isJsxAttribute(node) && COPY_PROPERTY_NAMES.has(propertyNameText(node.name) ?? '')) {
      const initializer = node.initializer;
      if (initializer) {
        const target = ts.isJsxExpression(initializer) ? initializer.expression : initializer;
        if (target) {
          const value = literalValue(target);
          if (value !== null) addCopyFinding(findings, filePath, sourceFile, source, target.getStart(sourceFile), value);
        }
      }
    }
    if (ts.isPropertyAssignment(node) && COPY_PROPERTY_NAMES.has(propertyNameText(node.name) ?? '')) {
      const value = literalValue(node.initializer);
      if (value !== null) addCopyFinding(findings, filePath, sourceFile, source, node.initializer.getStart(sourceFile), value);
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && ['innerText', 'textContent'].includes(node.left.name.text)) {
      const value = literalValue(node.right);
      if (value !== null) addCopyFinding(findings, filePath, sourceFile, source, node.right.getStart(sourceFile), value);
    }
    if (isRawErrorValue(node) && hasUserVisibleAncestor(node)) {
      const position = node.getStart(sourceFile);
      findings.push({
        file: path.relative(process.cwd(), filePath),
        line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
        text: lineText(source, position),
        reason: 'raw error value',
      });
    }
    ts.forEachChild(node, (child) => visit(child, nextInsideText));
  };
  visit(sourceFile);
  return findings;
}

function scanHtmlCopy(filePath: string): Finding[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const findings: Finding[] = [];
  const candidates = [
    ...source.matchAll(/>([^<]+)</gu),
    ...source.matchAll(/\b(?:aria-label|title|placeholder)=["']([^"']+)["']/giu),
  ];
  for (const match of candidates) {
    const value = match[1] ?? '';
    const rule = matchingRule(value, FORBIDDEN_COPY);
    if (!rule || match.index === undefined) continue;
    findings.push({
      file: path.relative(process.cwd(), filePath),
      line: source.slice(0, match.index).split('\n').length,
      text: value.trim(),
      reason: rule.source,
    });
  }
  return findings;
}

function scanComments(filePath: string): Finding[] {
  if (path.basename(filePath) === 'consumer-copy-policy.test.ts') return [];
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = sourceFileFor(filePath, source);
  const findings: Finding[] = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, undefined, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const value = scanner.getTokenText();
    const rule = matchingRule(value, FORBIDDEN_COMMENT);
    if (!rule) continue;
    const position = scanner.getTokenPos();
    findings.push({
      file: path.relative(process.cwd(), filePath),
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      text: lineText(source, position),
      reason: rule.source,
    });
  }
  return findings;
}

function formatFindings(findings: readonly Finding[]): string {
  return findings.map((finding) => (
    `${finding.file}:${finding.line} [${finding.reason}] ${finding.text}`
  )).join('\n');
}

describe('C 端文案与注释门禁', () => {
  it('用户可见出口不包含实现术语和自我解释', () => {
    const findings = [
      ...collectFiles(SOURCE_ROOTS, SOURCE_EXTENSIONS).flatMap(scanSourceCopy),
      ...collectFiles(SOURCE_ROOTS, HTML_EXTENSIONS).flatMap(scanHtmlCopy),
    ];
    expect(formatFindings(findings)).toBe('');
  });

  it('代码注释不记录改造过程或为当前实现辩解', () => {
    const findings = collectFiles(COMMENT_ROOTS, SOURCE_EXTENSIONS).flatMap(scanComments);
    expect(formatFindings(findings)).toBe('');
  });

  it('公共错误出口只返回可行动文案', () => {
    expect(providerErrorToUserMessage(
      new ProviderError('authentication', 'raw token error', false),
      '读取失败，请重试。',
    )).toBe('登录已失效，请重新绑定账号。');
    expect(providerErrorToUserMessage(
      new ProviderError('network', 'fetch failed', true),
      '读取失败，请重试。',
      { network: '暂时无法同步，请稍后重试。' },
    )).toBe('暂时无法同步，请稍后重试。');
    expect(providerErrorToUserMessage(new Error('raw error'), '读取失败，请重试。'))
      .toBe('读取失败，请重试。');
    expect(providerErrorToUserMessage(
      new ProviderError('upstream_schema', 'invalid schema', false),
      '读取失败，请重试。',
    )).toBe('读取失败，请重试。');
  });
});
