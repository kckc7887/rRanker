import {
  PHIGROS_FONT_MANIFEST,
  type PhigrosFontManifestEntry,
} from './phigros-font-cache';

/** Manifest `name` → CSS `font-family` 名称（与 common.css 一致）。 */
export const PHIGROS_FONT_CSS_FAMILY: Readonly<Record<string, string>> = {
  phi: 'PHI',
  'Aldrich-Regular': 'Aldrich',
  NotoSansArabic: 'NotoSansArabic',
  NotoSansSymbols2: 'NotoSansSymbols2',
  'NotoSans-Regular': 'NOTO',
  NotoSansJP: 'NotoSansJP',
  NotoSansKannada: 'NotoSansKannada',
  NotoSansCanadianAboriginal: 'NotoSansCanadianAboriginal',
  'NotoColorEmoji-Regular': 'NotoColorEmoji-Regular',
  HIMALAYA: 'HIMALAYA',
  吞弥恰俊: '吞弥恰俊',
  'NotoSansMath-Regular': 'NotoSansMath-Regular',
};

/** body 字体栈顺序（不含 Aldrich；Aldrich 仅用于页脚 / 分区分隔线）。 */
export const PHIGROS_BODY_FONT_STACK_ORDER = [
  'phi',
  'NotoSansArabic',
  'NotoSansSymbols2',
  'NotoSans-Regular',
  'NotoSansJP',
  'NotoSansKannada',
  'NotoSansCanadianAboriginal',
  'NotoColorEmoji-Regular',
  'HIMALAYA',
  '吞弥恰俊',
  'NotoSansMath-Regular',
] as const;

function inRange(code: number, start: number, end: number): boolean {
  return code >= start && code <= end;
}

function isEmojiCodePoint(code: number): boolean {
  // 仅补充平面与明确 emoji 区块；BMP 符号走 NotoSansSymbols2，避免误拉 ~24MB 彩色 Emoji。
  return inRange(code, 0x1F300, 0x1FAFF)
    || inRange(code, 0x1F1E6, 0x1F1FF)
    || code === 0x20E3;
}

function isArabicCodePoint(code: number): boolean {
  return inRange(code, 0x0600, 0x06FF)
    || inRange(code, 0x0750, 0x077F)
    || inRange(code, 0x08A0, 0x08FF)
    || inRange(code, 0xFB50, 0xFDFF)
    || inRange(code, 0xFE70, 0xFEFF);
}

function isHiraganaOrKatakana(code: number): boolean {
  return inRange(code, 0x3040, 0x309F)
    || inRange(code, 0x30A0, 0x30FF)
    || inRange(code, 0xFF65, 0xFF9F);
}

function isKannada(code: number): boolean {
  return inRange(code, 0x0C80, 0x0CFF);
}

function isCanadianAboriginal(code: number): boolean {
  return inRange(code, 0x1400, 0x167F) || inRange(code, 0x18B0, 0x18FF);
}

function isTibetan(code: number): boolean {
  return inRange(code, 0x0F00, 0x0FFF);
}

function isMath(code: number): boolean {
  return inRange(code, 0x2200, 0x22FF)
    || inRange(code, 0x27C0, 0x27EF)
    || inRange(code, 0x2980, 0x29FF)
    || inRange(code, 0x2A00, 0x2AFF)
    || inRange(code, 0x1D400, 0x1D7FF);
}

function isSymbolBlock(code: number): boolean {
  return inRange(code, 0x2100, 0x214F)
    || inRange(code, 0x2190, 0x21FF)
    || inRange(code, 0x2300, 0x23FF)
    || inRange(code, 0x2460, 0x24FF)
    || inRange(code, 0x2500, 0x257F)
    || inRange(code, 0x25A0, 0x25FF)
    || inRange(code, 0x2600, 0x26FF)
    || inRange(code, 0x2700, 0x27BF)
    || inRange(code, 0x2B00, 0x2BFF);
}

/** PHI 已覆盖：基本拉丁、常用标点、CJK。其余西欧/西里尔等走 NOTO。 */
function needsNotoSansRegular(code: number): boolean {
  if (code <= 0x007F) return false;
  if (inRange(code, 0x00A0, 0x024F)) return true;
  if (inRange(code, 0x0370, 0x03FF)) return true;
  if (inRange(code, 0x0400, 0x04FF)) return true;
  if (inRange(code, 0x1E00, 0x1EFF)) return true;
  return false;
}

/**
 * 根据成绩图可见文本解析需要的字体（始终包含核心字体）。
 * 扩展字体按 Unicode 脚本/区块启发式映射到参考模板 fallback 栈。
 */
export function resolveNeededPhigrosFonts(
  texts: readonly string[],
  manifest: readonly PhigrosFontManifestEntry[] = PHIGROS_FONT_MANIFEST,
): PhigrosFontManifestEntry[] {
  const needed = new Set<string>();
  for (const entry of manifest) {
    if (entry.core) needed.add(entry.name);
  }

  const joined = texts.join('\0');
  for (const character of joined) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (isEmojiCodePoint(code)) needed.add('NotoColorEmoji-Regular');
    else if (isArabicCodePoint(code)) needed.add('NotoSansArabic');
    else if (isHiraganaOrKatakana(code)) needed.add('NotoSansJP');
    else if (isKannada(code)) needed.add('NotoSansKannada');
    else if (isCanadianAboriginal(code)) needed.add('NotoSansCanadianAboriginal');
    else if (isTibetan(code)) needed.add('HIMALAYA');
    else if (isMath(code)) needed.add('NotoSansMath-Regular');
    else if (isSymbolBlock(code)) needed.add('NotoSansSymbols2');
    else if (needsNotoSansRegular(code)) needed.add('NotoSans-Regular');
  }

  return manifest.filter((entry) => needed.has(entry.name));
}

export function phigrosFontCssFamilyNames(entries: readonly PhigrosFontManifestEntry[]): string[] {
  return entries
    .map((entry) => PHIGROS_FONT_CSS_FAMILY[entry.name])
    .filter((name): name is string => !!name);
}

/**
 * 裁剪模板 CSS：只保留所需 @font-face，并缩短 body font-family 栈。
 * Aldrich 相关选择器保留原样（核心字体始终下载）。
 */
export function trimPhigrosBestImageCss(
  css: string,
  neededEntries: readonly PhigrosFontManifestEntry[],
): string {
  const families = new Set(phigrosFontCssFamilyNames(neededEntries));
  let result = '';
  let index = 0;
  while (index < css.length) {
    const faceStart = css.indexOf('@font-face', index);
    if (faceStart === -1) {
      result += css.slice(index);
      break;
    }
    result += css.slice(index, faceStart);
    const openBrace = css.indexOf('{', faceStart);
    if (openBrace === -1) {
      result += css.slice(faceStart);
      break;
    }
    let depth = 0;
    let end = openBrace;
    for (; end < css.length; end += 1) {
      const char = css[end];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    const block = css.slice(faceStart, end);
    const familyMatch = /font-family:\s*"([^"]+)"/u.exec(block);
    const family = familyMatch?.[1];
    if (family && families.has(family)) result += block;
    index = end;
  }

  const bodyStack = PHIGROS_BODY_FONT_STACK_ORDER
    .filter((name) => neededEntries.some((entry) => entry.name === name))
    .map((name) => `"${PHIGROS_FONT_CSS_FAMILY[name]}"`)
    .join(', ');

  return result.replace(
    /body\s*\{\s*font-family:\s*[^;]+;/u,
    `body {\n  font-family:\n    ${bodyStack};`,
  );
}
