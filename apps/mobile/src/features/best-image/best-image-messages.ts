export function minimumBestImageHeight(width: number): number {
  return Math.ceil(width * 4 / 3);
}

export function parseBestImageHeightMessage(
  data: string,
  expectedWidth: number,
  minimumHeight = minimumBestImageHeight(expectedWidth),
): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; height?: unknown };
    if (message.type !== 'best-image-height' || message.width !== expectedWidth) return null;
    if (typeof message.height !== 'number' || !Number.isFinite(message.height)) return null;
    return Math.max(1, Math.round(minimumHeight), Math.round(message.height));
  } catch {
    return null;
  }
}

export function parseBestImageReadyMessage(
  data: string,
  expectedWidth: number,
  minimumHeight = minimumBestImageHeight(expectedWidth),
): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; height?: unknown };
    if (message.type !== 'best-image-ready' || message.width !== expectedWidth) return null;
    if (typeof message.height !== 'number' || !Number.isFinite(message.height)) return null;
    return Math.max(1, Math.round(minimumHeight), Math.round(message.height));
  } catch {
    return null;
  }
}

export type BestImageRuntimeMessage = {
  userAgent: string;
  version: string | null;
};

export function bestImageWebViewVersion(userAgent: string): string | null {
  const chromeVersion = /(?:Chrome|CriOS)\/([\d.]+)/u.exec(userAgent)?.[1];
  if (chromeVersion) return chromeVersion;
  return /AppleWebKit\/([\d.]+)/u.exec(userAgent)?.[1] ?? null;
}

export function parseBestImageRuntimeMessage(data: string, expectedWidth: number): BestImageRuntimeMessage | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; userAgent?: unknown };
    if (message.type !== 'best-image-runtime' || message.width !== expectedWidth) return null;
    if (typeof message.userAgent !== 'string') return null;
    return {
      userAgent: message.userAgent,
      version: bestImageWebViewVersion(message.userAgent),
    };
  } catch {
    return null;
  }
}
