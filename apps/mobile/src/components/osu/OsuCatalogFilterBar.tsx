import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterCheckboxList } from '@/components/game-content/FilterCheckboxList';
import { FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import {
  OSU_EXTRA_FILTERS,
  OSU_GENERAL_FILTERS,
  OSU_GENRE_FILTERS,
  OSU_LANGUAGE_FILTERS,
  OSU_NSFW_FILTERS,
  OSU_STATUS_FILTERS,
  type OsuExtraFlag,
  type OsuGeneralFlag,
  type OsuSearchStatus,
} from '@/domain/osu';
import { formatOsuStar } from '@/domain/osu-star-theme';

type OpenDropdown = 'general' | 'status' | 'genre' | 'language' | 'nsfw' | 'extras' | null;

export interface OsuCatalogFilterBarProps {
  collapsed: boolean;
  general: readonly OsuGeneralFlag[];
  status: OsuSearchStatus;
  genre: number;
  language: number;
  nsfw: boolean;
  extras: readonly OsuExtraFlag[];
  /** 上游返回的当前用户推荐难度（星数），用于「推荐难度N★」值标签；未知时不显示数字。 */
  recommendedDifficulty: number | null;
  onCollapsedChange: (value: boolean) => void;
  onGeneralChange: (values: readonly OsuGeneralFlag[]) => void;
  onStatusChange: (value: OsuSearchStatus) => void;
  onGenreChange: (value: number) => void;
  onLanguageChange: (value: number) => void;
  onNsfwChange: (value: boolean) => void;
  onExtrasChange: (values: readonly OsuExtraFlag[]) => void;
  onReset: () => void;
}

function filterLabel<F extends string>(
  filters: readonly { flag: F; label: string }[],
  flag: F,
): string {
  return filters.find((item) => item.flag === flag)?.label ?? flag;
}

/** 常规组值标签：选中项「 · 」连接；「推荐难度」选中且已知星数时追加 N★（两位小数）。 */
export function osuGeneralValueLabel(
  general: readonly OsuGeneralFlag[],
  recommendedDifficulty: number | null,
): string {
  if (general.length === 0) return '全部';
  return general.map((flag) => {
    const base = filterLabel(OSU_GENERAL_FILTERS, flag);
    if (flag === 'recommended' && recommendedDifficulty != null) {
      return `${base}${formatOsuStar(recommendedDifficulty)}`;
    }
    return base;
  }).join(' · ');
}

function joinedExtraLabel(extras: readonly OsuExtraFlag[]): string {
  if (extras.length === 0) return '全部';
  return extras.map((flag) => filterLabel(OSU_EXTRA_FILTERS, flag)).join(' · ');
}

/** 收起态摘要：仅列生效条件（全默认时「全部」）。 */
export function buildOsuCatalogFilterSummary({
  general,
  status,
  genre,
  language,
  nsfw,
  extras,
  recommendedDifficulty,
}: Pick<OsuCatalogFilterBarProps,
  'general' | 'status' | 'genre' | 'language' | 'nsfw' | 'extras' | 'recommendedDifficulty'>): string {
  return joinFilterSummary([
    ...general.map((flag) => {
      const base = filterLabel(OSU_GENERAL_FILTERS, flag);
      return flag === 'recommended' && recommendedDifficulty != null
        ? `${base}${formatOsuStar(recommendedDifficulty)}`
        : base;
    }),
    status === 'any' ? null : OSU_STATUS_FILTERS.find((item) => item.value === status)?.label,
    genre === 0 ? null : OSU_GENRE_FILTERS.find((item) => item.value === genre)?.label,
    language === 0 ? null : OSU_LANGUAGE_FILTERS.find((item) => item.value === language)?.label,
    nsfw ? '显示不良内容' : null,
    ...extras.map((flag) => filterLabel(OSU_EXTRA_FILTERS, flag)),
  ]);
}

/**
 * osu! 曲库筛选栏：全部选项来自 osu.ppy.sh 官方搜索接口（m 恒为当前模式，不提供任何模式控件）。
 * 六个筛选组布局三行各两个（常规+分类、流派+语言、不良内容+其他）：
 * 常规/其他用公共 FilterCheckboxList（选项带复选框、勾选即生效、无完成按钮），其余用公共 FilterAnchoredDropdown 单选。
 */
export function OsuCatalogFilterBar({
  collapsed,
  general,
  status,
  genre,
  language,
  nsfw,
  extras,
  recommendedDifficulty,
  onCollapsedChange,
  onGeneralChange,
  onStatusChange,
  onGenreChange,
  onLanguageChange,
  onNsfwChange,
  onExtrasChange,
  onReset,
}: OsuCatalogFilterBarProps) {
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const setDropdownOpen = (id: OpenDropdown) => (open: boolean) => {
    setOpenDropdown(open ? id : null);
  };

  const generalOptions = useMemo<FilterSelectOption<OsuGeneralFlag>[]>(() => (
    OSU_GENERAL_FILTERS.map((item) => ({ value: item.flag, label: item.label }))
  ), []);
  const statusOptions = useMemo<FilterSelectOption<OsuSearchStatus>[]>(() => (
    OSU_STATUS_FILTERS.map((item) => ({ value: item.value, label: item.label }))
  ), []);
  const genreOptions = useMemo<FilterSelectOption<string>[]>(() => (
    OSU_GENRE_FILTERS.map((item) => ({ value: String(item.value), label: item.label }))
  ), []);
  const languageOptions = useMemo<FilterSelectOption<string>[]>(() => (
    OSU_LANGUAGE_FILTERS.map((item) => ({ value: String(item.value), label: item.label }))
  ), []);
  const nsfwOptions = useMemo<FilterSelectOption<string>[]>(() => (
    OSU_NSFW_FILTERS.map((item) => ({ value: String(item.value), label: item.label }))
  ), []);
  const extraOptions = useMemo<FilterSelectOption<OsuExtraFlag>[]>(() => (
    OSU_EXTRA_FILTERS.map((item) => ({ value: item.flag, label: item.label }))
  ), []);

  const generalLabel = osuGeneralValueLabel(general, recommendedDifficulty);
  const statusLabel = OSU_STATUS_FILTERS.find((item) => item.value === status)?.label ?? '全部';
  const genreLabel = OSU_GENRE_FILTERS.find((item) => item.value === genre)?.label ?? '全部';
  const languageLabel = OSU_LANGUAGE_FILTERS.find((item) => item.value === language)?.label ?? '全部';
  const nsfwLabel = OSU_NSFW_FILTERS.find((item) => item.value === nsfw)?.label ?? '隐藏';
  const extrasLabel = joinedExtraLabel(extras);

  const summary = buildOsuCatalogFilterSummary({
    general,
    status,
    genre,
    language,
    nsfw,
    extras,
    recommendedDifficulty,
  });

  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };

  return (
    <FilterShell collapsed={collapsed} summary={summary} barStyle={filterShellStyles.filterBarPlain}
      expandLabelPrefix="展开 osu! 筛选" collapseLabel="收起 osu! 筛选" resetLabel="重置 osu! 筛选"
      onCollapsedChange={onCollapsedChange} onReset={handleReset}
      onCollapse={() => { setOpenDropdown(null); onCollapsedChange(true); }}>
      <View testID="osu-catalog-filter-pair-row" style={styles.pairRow}>
        <FilterCheckboxList<OsuGeneralFlag>
          accessibilityLabel={`osu! 常规筛选，当前 ${generalLabel}`}
          caption="常规"
          onOpenChange={setDropdownOpen('general')}
          open={openDropdown === 'general'}
          optionAccessibilityPrefix="选择常规"
          options={generalOptions}
          selectedValues={general}
          onValuesChange={(values) => onGeneralChange(values)}
          valueLabel={generalLabel}
        />
        <FilterAnchoredDropdown<OsuSearchStatus>
          accessibilityLabel={`osu! 分类筛选，当前 ${statusLabel}`}
          caption="分类"
          onOpenChange={setDropdownOpen('status')}
          onSelect={onStatusChange}
          open={openDropdown === 'status'}
          optionAccessibilityPrefix="选择分类"
          options={statusOptions}
          selectedValue={status}
          valueLabel={statusLabel}
        />
      </View>

      <View testID="osu-catalog-filter-pair-row" style={styles.pairRow}>
        <FilterAnchoredDropdown
          accessibilityLabel={`osu! 流派筛选，当前 ${genreLabel}`}
          caption="流派"
          onOpenChange={setDropdownOpen('genre')}
          onSelect={(value) => onGenreChange(Number(value))}
          open={openDropdown === 'genre'}
          optionAccessibilityPrefix="选择流派"
          options={genreOptions}
          selectedValue={String(genre)}
          valueLabel={genreLabel}
        />
        <FilterAnchoredDropdown
          accessibilityLabel={`osu! 语言筛选，当前 ${languageLabel}`}
          caption="语言"
          onOpenChange={setDropdownOpen('language')}
          onSelect={(value) => onLanguageChange(Number(value))}
          open={openDropdown === 'language'}
          optionAccessibilityPrefix="选择语言"
          options={languageOptions}
          selectedValue={String(language)}
          valueLabel={languageLabel}
        />
      </View>

      <View testID="osu-catalog-filter-pair-row" style={styles.pairRow}>
        <FilterAnchoredDropdown
          accessibilityLabel={`osu! 不良内容筛选，当前 ${nsfwLabel}`}
          caption="不良内容"
          onOpenChange={setDropdownOpen('nsfw')}
          onSelect={(value) => onNsfwChange(value === 'true')}
          open={openDropdown === 'nsfw'}
          optionAccessibilityPrefix="选择不良内容"
          options={nsfwOptions}
          selectedValue={String(nsfw)}
          valueLabel={nsfwLabel}
        />
        <FilterCheckboxList<OsuExtraFlag>
          accessibilityLabel={`osu! 其他筛选，当前 ${extrasLabel}`}
          caption="其他"
          onOpenChange={setDropdownOpen('extras')}
          open={openDropdown === 'extras'}
          optionAccessibilityPrefix="选择其他"
          options={extraOptions}
          selectedValues={extras}
          onValuesChange={(values) => onExtrasChange(values)}
          valueLabel={extrasLabel}
        />
      </View>
    </FilterShell>
  );
}

// osu 专属样式：公共下拉/复选框列表根节点 flex:1 只在横向行容器内生效（宽度分配），
// 每个控件必须直接放在 row 容器里（同中二评价双下拉行），不得放进纵向 cell 包裹层（flexBasis 0 会导致列容器高度塌陷、内容互相叠压）。
const styles = StyleSheet.create({
  pairRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
});
