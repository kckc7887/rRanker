/** 配色参考 osu-web 的 mod.less。 */
import { useEffect, useState } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DetailPressable } from '@/components/game-content/DetailPressable';
import { osuModIconFileName, resolveOsuModTheme } from '@/domain/osu-mods';
import { OSU_MOD_ICONS_ROOT } from '@/providers/osu-config';

const DEFAULT_SIZE = 22;

const memoryXmlCache = new Map<string, string>();
const inFlightIcons = new Map<string, Promise<string | null>>();

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

async function ensureOsuModIconXml(acronym: string): Promise<string | null> {
  const cached = memoryXmlCache.get(acronym);
  if (cached) return cached;
  const existing = inFlightIcons.get(acronym);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const xml = await fetchOsuModIconXml(acronym);
      if (xml == null) return null;
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
  size?: number;
  testID?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
};

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
  /** 上游图标为白色填充或描边，需替换为类型前景色。 */
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
