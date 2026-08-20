/**
 * osu! 模组圆形徽章：类型色圆形底 + 单色模组图标（远程按需下载，磁盘缓存）。
 * 样式参考 refer/osu-web-master 模组徽章配色（mod.less 六类色 + color-mix 前景），
 * 以圆形替代官方六边形（六边形过宽）；图标未就绪/失败时圆内回退显示模组缩写文字
 * （与 osu-web 无图标时 data-acronym 文字回退一致）。
 */
import { useEffect, useState } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DetailPressable } from '@/components/game-content/DetailPressable';
import { osuModIconFileName, resolveOsuModTheme } from '@/domain/osu-mods';
import { OSU_MOD_ICONS_ROOT } from '@/providers/osu-config';

/** 默认直径：对齐标签行胶囊高度（GameDifficultyBadge 高 24）。 */
const DEFAULT_SIZE = 22;

// ---- 图标三级缓存（内存 → 磁盘 → 远程），inflight 防重共享同一下载 Promise ----

const memoryXmlCache = new Map<string, string>();
const inFlightIcons = new Map<string, Promise<string | null>>();

function osuModIconDirectory(): Directory {
  return new Directory(Paths.document, 'rranker', 'osu-mod-icons');
}

/** 远程图标文本（原始单色 SVG）；非 SVG 响应/网络失败/未配置根路径均返回 null（静默）。 */
async function fetchOsuModIconXml(acronym: string): Promise<string | null> {
  if (!OSU_MOD_ICONS_ROOT) return null;
  try {
    const response = await expoFetch(
      `${OSU_MOD_ICONS_ROOT}/${osuModIconFileName(acronym)}`,
      { headers: { Accept: 'image/svg+xml' } },
    );
    if (!response.ok) return null;
    const xml = await response.text();
    return xml.includes('<svg') ? xml : null;
  } catch {
    return null;
  }
}

/** 确保图标文本可用：内存 → 磁盘 → 远程下载后落盘；任一环节失败静默返回 null。 */
async function ensureOsuModIconXml(acronym: string): Promise<string | null> {
  const cached = memoryXmlCache.get(acronym);
  if (cached) return cached;
  const existing = inFlightIcons.get(acronym);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const directory = osuModIconDirectory();
      const file = new File(directory, osuModIconFileName(acronym));
      if (file.exists) {
        const xml = await file.text();
        if (xml.includes('<svg')) {
          memoryXmlCache.set(acronym, xml);
          return xml;
        }
        file.delete();
      }
      const xml = await fetchOsuModIconXml(acronym);
      if (xml == null) return null;
      directory.create({ intermediates: true, idempotent: true });
      file.write(xml);
      memoryXmlCache.set(acronym, xml);
      return xml;
    } catch {
      return null;
    } finally {
      inFlightIcons.delete(acronym);
    }
  })();
  inFlightIcons.set(acronym, pending);
  return pending;
}

/** 模组图标文本加载 hook：就绪返回原始 SVG 文本，未就绪/不可用为 null。 */
export function useOsuModIconXml(acronym: string): string | null {
  const [xml, setXml] = useState<string | null>(() => memoryXmlCache.get(acronym) ?? null);
  useEffect(() => {
    let alive = true;
    void ensureOsuModIconXml(acronym).then((value) => {
      if (alive) setXml(value);
    });
    return () => {
      alive = false;
    };
  }, [acronym]);
  return xml;
}

type OsuModBadgeProps = {
  acronym: string;
  /** 圆形直径，默认 22（对齐标签行胶囊高度）。 */
  size?: number;
  testID?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/** 单个模组徽章：未知 acronym 静默不渲染。 */
export function OsuModBadge({
  acronym,
  size = DEFAULT_SIZE,
  testID,
  onPress,
  accessibilityLabel = `模组 ${acronym}`,
}: OsuModBadgeProps) {
  const theme = resolveOsuModTheme(acronym);
  const xml = useOsuModIconXml(acronym);
  if (!theme) return null;
  // 图标源为单色（white fill/stroke），渲染前替换为该类型前景色。
  const tintedXml = xml ? xml.replaceAll('white', theme.foreground) : null;
  const iconBox = Math.round(size * 0.72);
  const badge = (
    <View
      accessibilityLabel={onPress ? undefined : accessibilityLabel}
      pointerEvents={onPress ? 'none' : undefined}
      style={[styles.badge, {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.background,
      }]}
      testID={onPress ? undefined : testID ?? `osu-mod-badge-${acronym}`}
    >
      {tintedXml ? (
        <SvgXml height={iconBox} width={iconBox} xml={tintedXml} />
      ) : (
        <Text style={[styles.fallback, { color: theme.foreground, fontSize: size * 0.36 }]}>
          {acronym}
        </Text>
      )}
    </View>
  );
  if (!onPress) return badge;
  return (
    <DetailPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
      testID={testID ?? `osu-mod-badge-${acronym}`}
    >
      {badge}
    </DetailPressable>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallback: { fontWeight: '900', letterSpacing: 0.2 },
  pressed: { opacity: 0.58 },
});
