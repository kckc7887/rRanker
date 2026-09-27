/**
 * Phigros 头像解析：
 * 把存档里的头像名换算成对象存储上的可访问 URL —— 用发布资源 `metadata/tmp.tsv` 建立
 * 「展示名 / 内部 key → OSS 文件名」映射，再按当前发布目录与 resourceVersion 拼出 URL。
 *
 * 发布读取是 I/O，因此本模块位于服务层：它只经端口访问发布资源，纯映射函数可直接单测。
 */

import { buildPhigrosAvatarUrl, phigrosReleaseDirectory } from '@/domain/account-avatar';
import { phigrosResources } from '@/services/phigros-resources';

type AvatarAliasMap = {
  fileByKey: Map<string, string>;
};

/**
 * 头像解析端口：读取头像别名表的发布资源，以及当前发布快照（决定目录与版本查询参数）。
 * 注入端口即可在不替换全局 fetch 的前提下验证解析，无需访问共享发布单例。
 */
export type PhigrosAvatarResourcePort = {
  /** 读取含 `metadata/tmp.tsv` 的发布资源；修订号用于缓存别名表。 */
  loadAvatarAliases(signal?: AbortSignal): Promise<{ revision: string; avatarAliases: string }>;
  /** 当前已加载的发布快照；未加载时为 null，此时按传入的游戏版本推导目录。 */
  currentRelease(): { manifest: string; resourceVersion: string } | null;
};

export type PhigrosAvatarResolver = {
  /** 可分发 OSS 头像素材清单，供成绩图样式选择使用。 */
  loadCatalog(gameVersion: string): Promise<string[]>;
  /** 头像名 → OSS 文件名；未知名字原样返回。 */
  resolveFileName(gameVersion: string, avatarKey: string | null | undefined): Promise<string | null>;
  /** 头像名 → 可访问 URL；缺少游戏版本时为 null。 */
  resolveUrl(gameVersion: string | null | undefined, avatarKey: string | null | undefined): Promise<string | null>;
  /** 清空别名表缓存（测试与发布切换用）。 */
  resetAliasCache(): void;
};

function parseAvatarAliasTsv(text: string): AvatarAliasMap {
  const fileByKey = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.indexOf('\t');
    if (tab < 0) continue;
    const displayName = trimmed.slice(0, tab).trim();
    const ossName = trimmed.slice(tab + 1).trim();
    if (!displayName || !ossName) continue;
    // OSS avatars/ 下文件名与 tmp.tsv 第二列（内部 key）一致，如 Cipher1.png。
    fileByKey.set(ossName, ossName);
    fileByKey.set(displayName, ossName);
  }
  return { fileByKey };
}

/** 去掉存档里的 `avatar.` 前缀并裁剪空白；供展示层与解析共用。 */
export function normalizePhigrosAvatarKey(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.startsWith('avatar.') ? trimmed.slice(7) : trimmed;
}

export function createPhigrosAvatarResolver(port: PhigrosAvatarResourcePort): PhigrosAvatarResolver {
  const aliasCache = new Map<string, AvatarAliasMap>();

  async function loadAliasMap(): Promise<AvatarAliasMap> {
    try {
      const release = await port.loadAvatarAliases();
      const cached = aliasCache.get(release.revision);
      if (cached) return cached;
      const map = parseAvatarAliasTsv(release.avatarAliases);
      aliasCache.clear();
      aliasCache.set(release.revision, map);
      return map;
    } catch {
      return { fileByKey: new Map<string, string>() };
    }
  }

  async function resolveFileName(
    gameVersion: string,
    avatarKey: string | null | undefined,
  ): Promise<string | null> {
    const key = normalizePhigrosAvatarKey(avatarKey);
    if (!key) return null;
    const map = await loadAliasMap();
    return map.fileByKey.get(key) ?? key;
  }

  return {
    async loadCatalog(): Promise<string[]> {
      const map = await loadAliasMap();
      return [...new Set(map.fileByKey.values())].sort((left, right) => left.localeCompare(right));
    },

    resolveFileName,

    async resolveUrl(gameVersion, avatarKey): Promise<string | null> {
      if (!gameVersion) return null;
      const fileName = await resolveFileName(gameVersion, avatarKey);
      const current = port.currentRelease();
      const directory = current
        ? phigrosReleaseDirectory(current.manifest)
        : `phigros/releases/${gameVersion}/`;
      return buildPhigrosAvatarUrl(directory, fileName, current?.resourceVersion);
    },

    resetAliasCache(): void {
      aliasCache.clear();
    },
  };
}

/** 默认端口：头像别名表与当前发布快照都来自共享 Phigros 发布资源单例。 */
export function createPhigrosAvatarResourcePort(): PhigrosAvatarResourcePort {
  return {
    loadAvatarAliases: async (signal) => {
      const release = await phigrosResources.load(signal);
      return { revision: release.revision, avatarAliases: release.avatarAliases };
    },
    currentRelease: () => {
      const current = phigrosResources.peek()?.current;
      return current ? { manifest: current.manifest, resourceVersion: current.resourceVersion } : null;
    },
  };
}

/** 默认装配：应用运行时入口。 */
const defaultResolver = createPhigrosAvatarResolver(createPhigrosAvatarResourcePort());

/** 可分发 OSS 头像素材清单，供成绩图样式选择使用。 */
export const loadPhigrosAvatarCatalog = (gameVersion: string): Promise<string[]> =>
  defaultResolver.loadCatalog(gameVersion);

export const resolvePhigrosAvatarFileName = (
  gameVersion: string,
  avatarKey: string | null | undefined,
): Promise<string | null> => defaultResolver.resolveFileName(gameVersion, avatarKey);

export const resolvePhigrosAvatarUrl = (
  gameVersion: string | null | undefined,
  avatarKey: string | null | undefined,
): Promise<string | null> => defaultResolver.resolveUrl(gameVersion, avatarKey);

export function resetPhigrosAvatarAliasCacheForTests(): void {
  defaultResolver.resetAliasCache();
}
