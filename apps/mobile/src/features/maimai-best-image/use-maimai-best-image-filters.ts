import { formatDxRatingTagFilterValue, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { DIFFICULTY_VISUAL } from '@/components/ScoreVisuals';
import { chartVersionKey } from '@/domain/catalog';
import { buildDxRatingChartTagIndex } from '@/domain/dxrating-chart-tags';
import {
  maimaiFcAchievementLabel,
  maimaiFsAchievementLabel,
  type MaimaiFcAchievement,
  type MaimaiFsAchievement,
} from '@/domain/maimai-filters';
import type { ChartType, Difficulty } from '@/domain/models';
import { localizedVersionName, type VersionNameLocale } from '@/domain/version-names';
import {
  DEFAULT_CUSTOM_BEST_IMAGE_FILTERS,
  buildCustomBestImageSections,
  maximumBestImageRowsForWidth,
  paginateBestImageSections,
  parseBestImageQuantity,
} from '@/features/best-image/best-image-custom';
import {
  type BestImageScoreSection,
  type BestImageType
} from '@/features/maimai-best-image/build-maimai-best-image-html';
import {
  useDetailedCatalog,
  useTransientDetailedMaimaiCatalog,
} from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { GameDataBundle } from '@/domain/game-data';

export function useMaimaiBestImageFilters({ maimai, activeAccountId, imageType, outputWidth, quantityText }: {
  maimai: Extract<GameDataBundle['payload'], { kind: 'maimai'; }> | null; activeAccountId: string;
  imageType: BestImageType; outputWidth: number; quantityText: string;
}) {
  const [quantity, setQuantity] = useState(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.quantity);
  const [versions, setVersions] = useState<string[]>([]);
  const [splitVersions, setSplitVersions] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [type, setType] = useState<ChartType | 'all'>('all');
  const [constantMin, setConstantMin] = useState('');
  const [constantMax, setConstantMax] = useState('');
  const [achievementMin, setAchievementMin] = useState('');
  const [achievementMax, setAchievementMax] = useState('');
  const [soloAchievement, setSoloAchievement] = useState<MaimaiFcAchievement | null>(null);
  const [multiAchievement, setMultiAchievement] = useState<MaimaiFsAchievement | null>(null);
  const [strictAchievement, setStrictAchievement] = useState(false);
  const [nearMiss, setNearMiss] = useState(false);
  const [versionLocale, setVersionLocale] = useState<VersionNameLocale>('china');
  const [selectedDxRatingTagIds, setSelectedDxRatingTagIds] = useState<number[]>([]);
  const quantityError = parseBestImageQuantity(quantityText) === null ? '数量必须是非负整数，0 表示不限制' : null;
  const customInputValid = !quantityError && versions.length > 0;
  const hasAchievementFilter = soloAchievement !== null || multiAchievement !== null;

  const dxRatingChartTags = useDxRatingChartTags();
  const catalog = useDetailedCatalog();
  const detailedCatalog = useTransientDetailedMaimaiCatalog(!!maimai);
  const dxRatingTagIndex = useMemo(() => buildDxRatingChartTagIndex(
    dxRatingChartTags.data,
    catalog.data?.songs ?? [],
  ), [catalog.data?.songs, dxRatingChartTags.data]);

  const versionOptions = useMemo<VersionFilterOption[]>(() => {
    if (!maimai) return [];
    return Array.from(new Set(maimai.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [maimai]);
  const versionLabels = useMemo(() => Object.fromEntries(
    versionOptions.map((option) => [option.value, localizedVersionName(option.versionId, option.name, versionLocale)]),
  ), [versionLocale, versionOptions]);

  const versionsInitializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (versionOptions.length === 0) return;
    if (versionsInitializedRef.current === activeAccountId) return;
    versionsInitializedRef.current = activeAccountId;
    setVersions(versionOptions.map((option) => option.value));
    setSplitVersions(false);
  }, [activeAccountId, versionOptions]);

  /** 单个非数量条件时标题为「{条件}N」；多个条件时标题为「自定义N」并附小字提示。 */
  const versionConditionLabel = useMemo(() => {
    if (versions.length === 0) return null;
    if (versions.length === versionOptions.length) return null;
    if (versions.length === 1) return versionLabels[versions[0]!] ?? versions[0];
    return `${versions.length} 个版本`;
  }, [versionLabels, versionOptions.length, versions]);

  const conditionLabels = useMemo(() => {
    const labels: string[] = [];
    if (difficulty !== 'all') labels.push(DIFFICULTY_VISUAL[difficulty].label);
    if (type !== 'all') labels.push(type);
    if (constantMin || constantMax) labels.push(`定数 ${constantMin || '不限'}~${constantMax || '不限'}`);
    if (achievementMin || achievementMax) labels.push(`达成率 ${achievementMin || '不限'}~${achievementMax || '不限'}%`);
    if (soloAchievement) labels.push(`单人 ${maimaiFcAchievementLabel(soloAchievement)}`);
    if (multiAchievement) labels.push(`多人 ${maimaiFsAchievementLabel(multiAchievement)}`);
    if (selectedDxRatingTagIds.length > 0) labels.push(`标签 ${formatDxRatingTagFilterValue(dxRatingChartTags.data?.tags ?? [], selectedDxRatingTagIds)}`);
    if (nearMiss) labels.push('寸');
    if (strictAchievement) labels.push('严格');
    return labels;
  }, [achievementMax, achievementMin, constantMax, constantMin, difficulty, dxRatingChartTags.data?.tags, multiAchievement, nearMiss, selectedDxRatingTagIds, soloAchievement, strictAchievement, type]);

  const customSections = useMemo(() => buildCustomBestImageSections(
    maimai?.records ?? [],
    {
      quantity,
      versions,
      splitVersions,
      difficulty,
      type,
      constantMin,
      constantMax,
      achievementMin,
      achievementMax,
      soloAchievement,
      multiAchievement,
      strictAchievement,
      nearMiss,
      selectedDxRatingTagIds,
      dxRatingTagIndex,
      versionLabels,
      conditionLabels,
      versionConditionLabel,
    },
  ), [achievementMax, achievementMin, conditionLabels, constantMax, constantMin, difficulty, dxRatingTagIndex, maimai?.records, multiAchievement, nearMiss, quantity, selectedDxRatingTagIds, soloAchievement, splitVersions, strictAchievement, type, versionConditionLabel, versionLabels, versions]);
  const rawScoreSections = useMemo<BestImageScoreSection[]>(() => imageType === 'best50'
    ? maimai?.bestSections ?? []
    : customSections, [customSections, imageType, maimai?.bestSections]);
  const detailedNotes = useMemo(() => new Map(
    detailedCatalog.data?.songs.flatMap((song) => song.charts.flatMap((chart) => chart.notes
      ? [[chartVersionKey(song.id, chart.type, chart.levelIndex), chart.notes] as const]
      : [])) ?? [],
  ), [detailedCatalog.data?.songs]);
  const scoreSections = useMemo<BestImageScoreSection[]>(() => rawScoreSections.map((section) => ({
    ...section,
    records: section.records.map((record) => {
      const notes = detailedNotes.get(chartVersionKey(record.songId, record.type, record.levelIndex));
      return notes ? { ...record, notes } : record;
    }),
  })), [detailedNotes, rawScoreSections]);
  const maximumRowsPerPage = maximumBestImageRowsForWidth(outputWidth);
  const pages = useMemo(
    () => paginateBestImageSections(scoreSections, maximumRowsPerPage),
    [maximumRowsPerPage, scoreSections],
  );
  const pageStructureKey = JSON.stringify(scoreSections.map((section) => [
    section.id,
    section.title,
    ...section.records.map((record) => `${record.songId}:${record.type}:${record.levelIndex}`),
  ]));

  const handleSoloAchievementChange = (value: MaimaiFcAchievement | null) => {
    setSoloAchievement(value);
    if (value === null && multiAchievement === null) setStrictAchievement(false);
  };

  const handleMultiAchievementChange = (value: MaimaiFsAchievement | null) => {
    setMultiAchievement(value);
    if (value === null && soloAchievement === null) setStrictAchievement(false);
  };

  const handleVersionsChange = (next: string[]) => {
    setVersions(next);
    if (next.length < 2) setSplitVersions(false);
  };

  const resetCustomFilters = () => {
    setDifficulty('all');
    setType('all');
    setConstantMin('');
    setConstantMax('');
    setAchievementMin('');
    setAchievementMax('');
    setSoloAchievement(null);
    setMultiAchievement(null);
    setStrictAchievement(false);
    setNearMiss(false);
    setSelectedDxRatingTagIds([]);
    setVersions(versionOptions.map((option) => option.value));
  };

  return { setQuantity, versions, splitVersions, setSplitVersions, difficulty, setDifficulty, type, setType, constantMin, setConstantMin, constantMax, setConstantMax, achievementMin, setAchievementMin, achievementMax, setAchievementMax, soloAchievement, multiAchievement, strictAchievement, setStrictAchievement, nearMiss, setNearMiss, versionLocale, setVersionLocale, selectedDxRatingTagIds, setSelectedDxRatingTagIds, quantityError, customInputValid, hasAchievementFilter, dxRatingChartTags, versionOptions, detailedCatalog, scoreSections, maximumRowsPerPage, pages, pageStructureKey, handleSoloAchievementChange, handleMultiAchievementChange, handleVersionsChange, resetCustomFilters };
}
