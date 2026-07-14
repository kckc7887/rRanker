import type { ImageSourcePropType } from 'react-native';

const SHARED = {
  10000: require('../../assets/images/version-logos/10000.png'),
  11000: require('../../assets/images/version-logos/11000.png'),
  12000: require('../../assets/images/version-logos/12000.png'),
  13000: require('../../assets/images/version-logos/13000.png'),
  14000: require('../../assets/images/version-logos/14000.png'),
  15000: require('../../assets/images/version-logos/15000.png'),
  16000: require('../../assets/images/version-logos/16000.png'),
  17000: require('../../assets/images/version-logos/17000.png'),
  18000: require('../../assets/images/version-logos/18000.png'),
  18500: require('../../assets/images/version-logos/18500.png'),
  19000: require('../../assets/images/version-logos/19000.png'),
  19500: require('../../assets/images/version-logos/19500.png'),
  19900: require('../../assets/images/version-logos/19900.png'),
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
    china: require('../../assets/images/version-logos/20000-cn.png'),
    japan: require('../../assets/images/version-logos/20000-jp.png'),
  },
  21000: {
    china: require('../../assets/images/version-logos/21000-cn.png'),
    japan: require('../../assets/images/version-logos/21000-jp.png'),
  },
  22000: {
    china: require('../../assets/images/version-logos/22000-cn.png'),
    japan: require('../../assets/images/version-logos/22000-jp.png'),
  },
  23000: {
    china: require('../../assets/images/version-logos/23000-cn.png'),
    japan: require('../../assets/images/version-logos/23000-jp.png'),
  },
  24000: {
    china: require('../../assets/images/version-logos/24000-cn.png'),
    japan: require('../../assets/images/version-logos/24000-jp.png'),
  },
  25000: {
    china: require('../../assets/images/version-logos/25000-cn.png'),
    japan: require('../../assets/images/version-logos/25000-jp.png'),
  },
  25500: {
    china: require('../../assets/images/version-logos/25500-cn.png'),
    japan: require('../../assets/images/version-logos/25500-jp.png'),
  },
};

export function versionLogoSource(
  versionId: number,
  locale: 'china' | 'japan',
): ImageSourcePropType | undefined {
  return VERSION_LOGO_SOURCES[versionId]?.[locale];
}
