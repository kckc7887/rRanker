import type { ImageSourcePropType } from 'react-native';

/** 版本 Logo 源：对象存储 rranker/assets/images/version-logos（与本地 assets/images 同名同路径）。 */
const VERSION_LOGO_BASE = 'https://rranker.cn-nb1.rains3.com/assets/images/version-logos';

function versionLogo(fileName: string): ImageSourcePropType {
  return { uri: `${VERSION_LOGO_BASE}/${fileName}` };
}

const SHARED = {
  10000: versionLogo('10000.png'),
  11000: versionLogo('11000.png'),
  12000: versionLogo('12000.png'),
  13000: versionLogo('13000.png'),
  14000: versionLogo('14000.png'),
  15000: versionLogo('15000.png'),
  16000: versionLogo('16000.png'),
  17000: versionLogo('17000.png'),
  18000: versionLogo('18000.png'),
  18500: versionLogo('18500.png'),
  19000: versionLogo('19000.png'),
  19500: versionLogo('19500.png'),
  19900: versionLogo('19900.png'),
} as const satisfies Record<number, ImageSourcePropType>;

/** 各主版本国服 / 日服 Logo。旧框时代两侧同图；DX 起国服用年份 branding。 */
export const VERSION_LOGO_SOURCES: Readonly<Record<number, { china: ImageSourcePropType; japan: ImageSourcePropType }>> = {
  10000: { china: SHARED[10000], japan: SHARED[10000] },
  11000: { china: SHARED[11000], japan: SHARED[11000] },
  12000: { china: SHARED[12000], japan: SHARED[12000] },
  13000: { china: SHARED[13000], japan: SHARED[13000] },
  14000: { china: SHARED[14000], japan: SHARED[14000] },
  15000: { china: SHARED[15000], japan: SHARED[15000] },
  16000: { china: SHARED[16000], japan: SHARED[16000] },
  17000: { china: SHARED[17000], japan: SHARED[17000] },
  18000: { china: SHARED[18000], japan: SHARED[18000] },
  18500: { china: SHARED[18500], japan: SHARED[18500] },
  19000: { china: SHARED[19000], japan: SHARED[19000] },
  19500: { china: SHARED[19500], japan: SHARED[19500] },
  19900: { china: SHARED[19900], japan: SHARED[19900] },
  20000: {
    china: versionLogo('20000-cn.png'),
    japan: versionLogo('20000-jp.png'),
  },
  21000: {
    china: versionLogo('21000-cn.png'),
    japan: versionLogo('21000-jp.png'),
  },
  22000: {
    china: versionLogo('22000-cn.png'),
    japan: versionLogo('22000-jp.png'),
  },
  23000: {
    china: versionLogo('23000-cn.png'),
    japan: versionLogo('23000-jp.png'),
  },
  24000: {
    china: versionLogo('24000-cn.png'),
    japan: versionLogo('24000-jp.png'),
  },
  25000: {
    china: versionLogo('25000-cn.png'),
    japan: versionLogo('25000-jp.png'),
  },
  25500: {
    china: versionLogo('25500-cn.png'),
    japan: versionLogo('25500-jp.png'),
  },
};

export function versionLogoSource(
  versionId: number,
  locale: 'china' | 'japan',
): ImageSourcePropType | undefined {
  return VERSION_LOGO_SOURCES[versionId]?.[locale];
}
