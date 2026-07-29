import { formatAchievement } from './score-presentation';
import {
  buildChunithmScoreCards,
  chunithmAchievementBadges,
  chunithmRankUsesGradient,
  formatChunithmScore,
} from './chunithm-score-presentation';
import { formatPhigrosChallengeBadge } from './phigros-challenge-theme';
import { formatPhigrosSongRks, LEVEL_NAMES } from './phigros';
import { phigrosXingLabel, resolvePhigrosXingKind } from './phigros-xing';
import {
  canonicalChartId,
  GAME_MODEL_SCHEMA,
  parseGameDataDocument,
  type BestSectionDocument,
  type GameDataDocumentV1,
  type ScoreCardDocument,
  type SongDocument,
  type TagGroupInstance,
  type TagRef,
  type TagValue,
} from './game-model';
import type { GameDataBundle } from './game-data';
import type {
  CatalogSnapshot,
  Chart,
  CollectionItem,
  ScoreRecord,
  Song,
} from './models';
import type { ChunithmCatalogSnapshot, ChunithmDifficulty, ChunithmSong } from './chunithm';
import { PHIGROS_OSS_BASE } from './account-avatar';
import { COLLECTION_KIND_LABEL, collectionsForSong } from './collections';
import { summarizeGameTools } from './game-toolbox';

const MAIMAI_DIFFICULTY_IDS = ['basic', 'advanced', 'expert', 'master', 'remaster'] as const;
const PHIGROS_DIFFICULTY_IDS = ['ez', 'hd', 'in', 'at'] as const;
const CHUNITHM_DIFFICULTY_IDS = [
  'basic', 'advanced', 'expert', 'master', 'ultima', 'worlds-end',
] as const;
const PROVIDER_TITLES: Record<string, string> = {
  'diving-fish': '水鱼查分器',
  lxns: '落雪查分器',
  local: '本地查分器',
  'maimai-test': '示例查分器',
  'chunithm-test': '示例查分器',
  'phi-taptap': 'TapTap 云存档',
};

type AdapterInput = {
  bundle: GameDataBundle;
  maimaiCatalog?: CatalogSnapshot;
  phigrosCatalog?: CatalogSnapshot;
  chunithmCatalog?: ChunithmCatalogSnapshot;
  favorites?: number;
  practice?: number;
  collections?: readonly CollectionItem[];
};

function stringValue(value: string): { kind: 'string'; value: string } {
  return { kind: 'string', value };
}

function intValue(value: number): { kind: 'int'; value: number } {
  return { kind: 'int', value: Math.trunc(value) };
}

function searchText(values: (string | number | undefined | null)[]): string {
  return values.filter((value) => value !== undefined && value !== null)
    .join(' ')
    .normalize('NFKC')
    .toLowerCase();
}

function maimaiDifficultyId(chart: Chart): string {
  return chart.type === 'UTAGE'
    ? 'utage'
    : MAIMAI_DIFFICULTY_IDS[chart.levelIndex] ?? 'master';
}

function chartTypeItemId(type: Chart['type']): string {
  return type === 'DX' ? 'dx' : type === 'UTAGE' ? 'utage' : 'sd';
}

function maimaiNotesGroup(chart: Chart): TagGroupInstance | undefined {
  if (!chart.notes) return undefined;
  const notes = chart.notes;
  if ('left' in notes && 'right' in notes) {
    const side = (sideId: 'left' | 'right') => ({
      groupId: `buddy-${sideId}`,
      items: Object.entries(notes[sideId]).map(([itemId, value]) => ({
        itemId,
        value: intValue(value),
      })),
    });
    return {
      groupId: 'notes',
      items: [{
        itemId: 'table',
        value: {
          kind: 'tag-group',
          value: {
            groupId: 'buddy-notes',
            items: [
              { itemId: 'left', value: { kind: 'tag-group', value: side('left') } },
              { itemId: 'right', value: { kind: 'tag-group', value: side('right') } },
            ],
          },
        },
      }],
    };
  }
  return {
    groupId: 'notes',
    items: Object.entries(notes).map(([itemId, value]) => ({
      itemId,
      value: intValue(value),
    })),
  };
}

function songFromMaimai(song: Song, collections: readonly CollectionItem[] = []): SongDocument {
  const charts = song.charts ?? [];
  const grouped = new Map<Chart['type'], Chart[]>();
  for (const chart of charts) {
    grouped.set(chart.type, [...(grouped.get(chart.type) ?? []), chart]);
  }
  return {
    id: song.id,
    title: song.title,
    artist: song.artist ?? '曲师未知',
    cover: { kind: 'resolver', resolverId: 'maimai-jacket', key: song.id },
    attributes: [
      {
        groupId: 'version',
        items: [{ itemId: 'value', value: stringValue(song.version) }],
      },
      ...(song.aliases?.length ? [{
        groupId: 'aliases',
        items: [{ itemId: 'value', value: stringValue(song.aliases.join('、')) }],
      }] : []),
      ...(song.genre ? [{
        groupId: 'genre',
        items: [{ itemId: 'value', value: stringValue(song.genre) }],
      }] : []),
      ...(song.bpm !== undefined ? [{
        groupId: 'bpm',
        items: [{ itemId: 'value', value: intValue(song.bpm) }],
      }] : []),
      ...(song.region ? [{
        groupId: 'region',
        items: [{ itemId: 'value', value: stringValue(song.region) }],
      }] : []),
    ],
    customSections: collectionsForSong(collections, song.id).length ? [{
      id: 'exclusive-collections',
      title: '曲目专属收藏品',
      kind: 'list',
      items: collectionsForSong(collections, song.id).map((item) => ({
        id: `${item.kind}:${item.id}`,
        title: item.name,
        subtitle: `${COLLECTION_KIND_LABEL[item.kind]}${item.description ? ` · ${item.description}` : ''}`,
      })),
    }] : [],
    chartGroups: [...grouped.entries()].map(([type, charts]) => ({
      type: {
        groupId: 'chart-type',
        itemId: chartTypeItemId(type),
      },
      charts: charts.sort((left, right) => left.levelIndex - right.levelIndex).map((chart) => ({
        id: canonicalChartId('maimai', song.id, type, chart.levelIndex),
        difficulty: {
          groupId: 'difficulty',
          itemId: maimaiDifficultyId(chart),
          value: stringValue(chart.type === 'UTAGE'
            ? `${chart.utage?.kanji?.trim() || 'U·TA·GE'} ${chart.level}`.trim()
            : chart.level),
          auxiliaryValue: chart.type === 'UTAGE' ? undefined : chart.difficultyConstant,
        },
        attributes: [
          ...(chart.charter ? [{
            groupId: 'charter',
            items: [{ itemId: 'value', value: stringValue(chart.charter) }],
          }] : []),
          ...(chart.utage?.description ? [{
            groupId: 'special',
            items: [{ itemId: 'value', value: stringValue(chart.utage.description) }],
          }] : []),
          ...(maimaiNotesGroup(chart) ? [maimaiNotesGroup(chart)!] : []),
        ],
        filterValues: {
          type,
          difficulty: maimaiDifficultyId(chart),
          constant: chart.difficultyConstant,
          version: String(chart.versionId ?? song.versionId ?? song.version),
        },
      })),
    })),
    filterValues: {
      type: [...grouped.keys()],
      difficulty: charts.map(maimaiDifficultyId),
      constant: charts.map((chart) => chart.difficultyConstant),
      version: String(song.versionId ?? song.version),
    },
    searchText: searchText([
      song.id,
      song.title,
      song.artist,
      song.version,
      ...(song.aliases ?? []),
      ...charts.map((chart) => chart.charter),
    ]),
  };
}

function songFromPhigros(song: Song): SongDocument {
  const charts = song.charts ?? [];
  return {
    id: song.id,
    title: song.title,
    artist: song.artist ?? '曲师未知',
    cover: {
      kind: 'remote',
      uri: `${PHIGROS_OSS_BASE}/phigros/releases/${encodeURIComponent(song.version ?? 'latest')}/illustrations-blur/${encodeURIComponent(song.id)}.png`,
    },
    attributes: song.illustrator ? [{
      groupId: 'illustrator',
      items: [{ itemId: 'value', value: stringValue(song.illustrator) }],
    }] : [],
    customSections: [],
    chartGroups: charts.length ? [{
      charts: [...charts].sort((left, right) => right.levelIndex - left.levelIndex)
        .map((chart) => ({
          id: canonicalChartId('phigros', song.id, undefined, chart.levelIndex),
          difficulty: {
            groupId: 'difficulty',
            itemId: PHIGROS_DIFFICULTY_IDS[chart.levelIndex] ?? 'at',
            value: stringValue(LEVEL_NAMES[chart.levelIndex as keyof typeof LEVEL_NAMES] ?? chart.level),
            auxiliaryValue: chart.difficultyConstant,
          },
          attributes: [
            ...(chart.charter ? [{
              groupId: 'charter',
              items: [{ itemId: 'value', value: stringValue(chart.charter) }],
            }] : []),
            ...(chart.notes ? [{
              groupId: 'notes',
              items: Object.entries(chart.notes).map(([itemId, value]) => ({
                itemId,
                value: intValue(value),
              })),
            }] : []),
          ],
          filterValues: {
            difficulty: PHIGROS_DIFFICULTY_IDS[chart.levelIndex] ?? 'at',
            constant: chart.difficultyConstant,
          },
        })),
    }] : [],
    filterValues: {
      difficulty: charts.map((chart) => PHIGROS_DIFFICULTY_IDS[chart.levelIndex] ?? 'at'),
      constant: charts.map((chart) => chart.difficultyConstant),
    },
    searchText: searchText([
      song.id,
      song.title,
      song.artist,
      ...charts.map((chart) => chart.charter),
    ]),
  };
}

function chunithmDifficultyValue(difficulty: ChunithmDifficulty): string {
  if (difficulty.difficulty !== 5) return difficulty.level;
  const kanji = difficulty.kanji?.trim();
  if (kanji && difficulty.star !== undefined) return `${kanji}☆${difficulty.star}`;
  return kanji || difficulty.level;
}

export function adaptChunithmSong(song: ChunithmSong): SongDocument {
  const coverKey = String(
    song.difficulties.find((difficulty) => difficulty.difficulty === 5)?.originId ?? song.id,
  );
  return {
    id: String(song.id),
    title: song.title,
    artist: song.artist ?? '曲师未知',
    cover: { kind: 'resolver', resolverId: 'chunithm-jacket', key: coverKey },
    attributes: [],
    customSections: [],
    chartGroups: [{
      charts: [...song.difficulties].sort((left, right) => left.difficulty - right.difficulty)
        .map((difficulty) => ({
          id: canonicalChartId('chunithm', song.id, undefined, difficulty.difficulty),
          difficulty: {
            groupId: 'difficulty',
            itemId: CHUNITHM_DIFFICULTY_IDS[difficulty.difficulty] ?? 'worlds-end',
            value: stringValue(chunithmDifficultyValue(difficulty)),
            auxiliaryValue: difficulty.difficulty === 5 ? undefined : difficulty.levelValue,
          },
          attributes: [
            ...(difficulty.noteDesigner ? [{
              groupId: 'charter',
              items: [{ itemId: 'value', value: stringValue(difficulty.noteDesigner) }],
            }] : []),
            ...(difficulty.notes ? [{
              groupId: 'notes',
              items: Object.entries(difficulty.notes).map(([itemId, value]) => ({
                itemId,
                value: intValue(value),
              })),
            }] : []),
          ],
          filterValues: {
            difficulty: CHUNITHM_DIFFICULTY_IDS[difficulty.difficulty] ?? 'worlds-end',
            constant: difficulty.levelValue,
          },
        })),
    }],
    filterValues: {
      difficulty: song.difficulties.map(
        (difficulty) => CHUNITHM_DIFFICULTY_IDS[difficulty.difficulty] ?? 'worlds-end',
      ),
      constant: song.difficulties.map((difficulty) => difficulty.levelValue),
    },
    searchText: searchText([
      song.id,
      song.title,
      song.artist,
      ...song.difficulties.map((difficulty) => difficulty.noteDesigner),
    ]),
  };
}

function tag(
  groupId: string,
  itemId: string,
  value?: TagValue,
  auxiliaryValue?: number,
): TagRef {
  return { groupId, itemId, value, auxiliaryValue };
}

function maimaiScore(record: ScoreRecord): ScoreCardDocument {
  const tags: TagRef[] = [
    tag('difficulty', maimaiDifficultyId(record), stringValue(record.level), record.difficultyConstant),
    tag('chart-type', chartTypeItemId(record.type)),
    tag('rate', 'value', stringValue(record.rate || '—')),
  ];
  if (record.fc) tags.push(tag('fc', 'value', stringValue(record.fc.toUpperCase())));
  if (record.fs) tags.push(tag('fs', 'value', stringValue(record.fs.toUpperCase())));
  return {
    id: `${record.songId}:${record.type}:${record.levelIndex}`,
    songId: record.songId,
    chartId: canonicalChartId('maimai', record.songId, record.type, record.levelIndex),
    title: record.title,
    primaryValue: tag('achievement', 'value', stringValue(formatAchievement(record.achievements))),
    tagRows: [tags.slice(0, 3), tags.slice(3)],
    trailingMetric: record.type === 'UTAGE'
      ? undefined
      : tag('rating', 'value', intValue(record.rating)),
    filterValues: {
      difficulty: maimaiDifficultyId(record),
      type: record.type,
      constant: record.difficultyConstant,
      achievement: record.achievements,
      version: record.version,
      fc: record.fc ?? '',
      fs: record.fs ?? '',
    },
    searchText: searchText([record.songId, record.title, record.charter]),
  };
}

function phigrosScore(record: ScoreRecord, totalNotes?: number): ScoreCardDocument {
  const xing = resolvePhigrosXingKind(
    record.achievements,
    totalNotes,
    record.fc === 'ap',
  );
  return {
    id: `${record.songId}:${record.levelIndex}`,
    songId: record.songId,
    chartId: canonicalChartId('phigros', record.songId, undefined, record.levelIndex),
    title: record.title,
    primaryValue: tag('score', 'value', intValue(record.dxScore ?? 0)),
    tagRows: [[
      tag(
        'difficulty',
        PHIGROS_DIFFICULTY_IDS[record.levelIndex] ?? 'at',
        stringValue(record.level),
        record.difficultyConstant,
      ),
      tag('rate', 'value', stringValue(record.rate === 'phi' ? 'φ' : record.rate.toUpperCase())),
      ...(xing ? [tag('xing', 'value', stringValue(phigrosXingLabel(xing)))] : []),
    ]],
    trailingMetric: tag('rks', 'value', stringValue(formatPhigrosSongRks(record.rating))),
    filterValues: {
      difficulty: PHIGROS_DIFFICULTY_IDS[record.levelIndex] ?? 'at',
      constant: record.difficultyConstant,
      accuracy: record.achievements,
      rate: record.rate,
      xing: xing ?? '',
    },
    searchText: searchText([record.songId, record.title, record.charter]),
  };
}

function phigrosNoteTotal(
  catalog: CatalogSnapshot | undefined,
  songId: string,
  levelIndex: number,
): number | undefined {
  const notes = catalog?.songs
    .find((song) => song.id === songId)
    ?.charts?.find((chart) => chart.levelIndex === levelIndex)
    ?.notes;
  if (!notes) return undefined;
  const total = 'total' in notes
    ? notes.total
    : Object.values(notes).reduce((sum, value) => sum + value, 0);
  return Number.isInteger(total) && total > 0 ? total : undefined;
}

function scoreTitleMap(songs: readonly SongDocument[]): Map<string, string> {
  return new Map(songs.map((song) => [song.id, song.title]));
}

function numericTagValue(tag: TagRef | undefined): number {
  if (!tag?.value || tag.value.kind === 'tag-group') return Number.NEGATIVE_INFINITY;
  const numeric = Number(tag.value.value);
  return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY;
}

function sortScoreCards(records: readonly ScoreCardDocument[]): ScoreCardDocument[] {
  return [...records].sort((left, right) => (
    numericTagValue(right.trailingMetric) - numericTagValue(left.trailingMetric)
    || numericTagValue(right.primaryValue) - numericTagValue(left.primaryValue)
    || left.title.localeCompare(right.title, 'zh-CN')
    || left.id.localeCompare(right.id)
  ));
}

function uniqueScoreRecords(records: readonly ScoreRecord[]): ScoreRecord[] {
  return [...new Map(records.map((record) => [
    `${record.songId}:${record.type}:${record.levelIndex}`,
    record,
  ])).values()];
}

function recordsForBundle(
  input: AdapterInput,
  songs: readonly SongDocument[],
): ScoreCardDocument[] {
  const payload = input.bundle.payload;
  const titles = scoreTitleMap(songs);
  if (payload.kind === 'maimai') {
    const sourceRecords = payload.records?.length
      ? payload.records
      : uniqueScoreRecords((payload.bestSections ?? []).flatMap((section) => section.records ?? []));
    const currentVersion = payload.currentVersionTitle ?? input.maimaiCatalog?.currentVersion.title;
    const currentBestIds = new Set(
      (payload.bestSections ?? [])
        .filter((section) => section.id === 'b15')
        .flatMap((section) => section.records ?? [])
        .map((record) => `${record.songId}:${record.type}:${record.levelIndex}`),
    );
    return sortScoreCards(sourceRecords.map((record) => {
      const card = maimaiScore({
        ...record,
        title: titles.get(record.songId) ?? record.title,
      });
      return {
        ...card,
        filterValues: {
          ...card.filterValues,
          version: record.version === currentVersion
            || currentBestIds.has(`${record.songId}:${record.type}:${record.levelIndex}`)
            ? [record.version, 'current']
            : record.version,
        },
      };
    }));
  }
  if (payload.kind === 'phigros') {
    const sourceRecords = payload.records?.length
      ? payload.records
      : uniqueScoreRecords((payload.bestSections ?? []).flatMap((section) => section.records ?? []));
    return sortScoreCards(sourceRecords.map((record) => phigrosScore(
      {
        ...record,
        title: titles.get(record.songId) ?? record.title,
      },
      phigrosNoteTotal(input.phigrosCatalog, record.songId, record.levelIndex),
    )));
  }
  if (payload.kind === 'chunithm') {
    return sortScoreCards(buildChunithmScoreCards(
      payload.scores ?? [],
      input.chunithmCatalog,
    ).map((record) => {
      const achievements = chunithmAchievementBadges(record);
      return {
        id: record.key,
        songId: record.songId,
        chartId: canonicalChartId('chunithm', record.songId, undefined, record.levelIndex),
        title: record.title,
        primaryValue: tag(
          'score',
          chunithmRankUsesGradient(record.rank) ? 'flowing' : 'value',
          stringValue(formatChunithmScore(record.score)),
        ),
        tagRows: [[
          tag(
            'difficulty',
            CHUNITHM_DIFFICULTY_IDS[record.levelIndex] ?? 'worlds-end',
            stringValue(record.level ?? record.worldsEndLabel ?? '—'),
            record.difficultyConstant,
          ),
          tag(
            'rank',
            chunithmRankUsesGradient(record.rank) ? 'flowing' : 'value',
            stringValue(record.rank),
          ),
        ], achievements.map((achievement) => (
          tag('achievement', achievement.tone, stringValue(achievement.label))
        ))],
        trailingMetric: record.rating === undefined
          ? undefined
          : tag('rating', 'value', stringValue(record.rating.toFixed(2))),
        filterValues: {
          difficulty: CHUNITHM_DIFFICULTY_IDS[record.levelIndex] ?? 'worlds-end',
          score: record.score,
        },
        searchText: searchText([
          record.songId,
          record.title,
          record.artist,
          record.noteDesigner,
        ]),
      };
    }));
  }
  return [];
}

function bestForBundle(
  input: AdapterInput,
  records: readonly ScoreCardDocument[],
  songs: readonly SongDocument[],
): BestSectionDocument[] {
  const payload = input.bundle.payload;
  const byId = new Map(records.map((record) => [record.id, record]));
  const titles = scoreTitleMap(songs);
  if (payload.kind === 'maimai') {
    return (payload.bestSections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      chartCountLabel: `${section.records.length} 张谱面`,
      records: sortScoreCards(section.records.map((record) => (
        byId.get(`${record.songId}:${record.type}:${record.levelIndex}`)
          ?? maimaiScore({ ...record, title: titles.get(record.songId) ?? record.title })
      ))),
    }));
  }
  if (payload.kind === 'phigros') {
    return (payload.bestSections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      chartCountLabel: `${section.records.length} 张谱面`,
      records: sortScoreCards(section.records.map((record) => (
        byId.get(`${record.songId}:${record.levelIndex}`)
          ?? phigrosScore(
            { ...record, title: titles.get(record.songId) ?? record.title },
            phigrosNoteTotal(input.phigrosCatalog, record.songId, record.levelIndex),
          )
      ))),
    }));
  }
  if (payload.kind === 'chunithm') {
    return (payload.bestSections ?? []).map((section) => {
      const cards = buildChunithmScoreCards(section.scores, input.chunithmCatalog);
      return {
        id: section.id,
        title: section.title,
        chartCountLabel: `${cards.length} 张谱面`,
        records: sortScoreCards(cards.flatMap((card) => {
          const existing = byId.get(card.key);
          return existing ? [existing] : [];
        })),
      };
    });
  }
  return [];
}

function accountName(bundle: GameDataBundle): string {
  const payload = bundle.payload;
  if (payload.kind === 'maimai' || payload.kind === 'phigros') {
    return payload.player?.displayName ?? bundle.profile?.title ?? bundle.gameId;
  }
  if (payload.kind === 'chunithm') return payload.player?.name ?? '落雪账号（待同步）';
  return payload.kind === 'empty' ? payload.displayName : bundle.profile?.title ?? bundle.gameId;
}

function scoreSource(bundle: GameDataBundle) {
  const payload = bundle.payload;
  if ('source' in payload && payload.source) {
    return {
      id: 'scores' as const,
      label: payload.source.label,
      updatedAt: payload.source.updatedAt,
      state: payload.source.isStale ? 'cache' as const : 'live' as const,
    };
  }
  return { id: 'scores' as const, label: '成绩暂不可用', state: 'unavailable' as const };
}

function catalogSource(input: AdapterInput) {
  const payload = input.bundle.payload;
  if ((payload.kind === 'maimai' || payload.kind === 'phigros') && payload.catalogSource) {
    return {
      id: 'catalog' as const,
      label: payload.catalogSource.label,
      updatedAt: payload.catalogSource.updatedAt,
      state: payload.catalogSource.isStale ? 'cache' as const : 'live' as const,
    };
  }
  if (input.chunithmCatalog) {
    return {
      id: 'catalog' as const,
      label: input.chunithmCatalog.source.label,
      updatedAt: input.chunithmCatalog.source.updatedAt,
      state: input.chunithmCatalog.source.isStale ? 'cache' as const : 'live' as const,
    };
  }
  return { id: 'catalog' as const, label: '曲库暂不可用', state: 'unavailable' as const };
}

function currentVersion(input: AdapterInput): string {
  const payload = input.bundle.payload;
  if (payload.kind === 'maimai') return payload.currentVersionTitle ?? '—';
  if (payload.kind === 'phigros') return payload.catalogSource?.label ?? '—';
  if (payload.kind === 'chunithm') return input.chunithmCatalog?.currentVersion.title ?? '—';
  return '—';
}

function overview(input: AdapterInput, best: readonly BestSectionDocument[]) {
  const payload = input.bundle.payload;
  const rawPlayerScore = payload.kind === 'maimai'
    || payload.kind === 'phigros'
    || payload.kind === 'chunithm'
    ? payload.playerScore
    : undefined;
  const playerScore = {
    label: rawPlayerScore?.label ?? input.bundle.profile?.ratingLabel ?? 'Rating',
    display: rawPlayerScore?.display
      ?? (rawPlayerScore?.value === undefined ? '—' : String(rawPlayerScore.value)),
  };
  const sideBadge = payload.kind === 'phigros'
    ? { label: '课题模式', value: formatPhigrosChallengeBadge(payload.challengeModeRank) }
    : undefined;
  const bestMeta = payload.kind === 'chunithm'
    ? (payload.bestSections ?? []).map((section) => {
      const average = section.scores.length
        ? section.scores.reduce((total, score) => total + (score.rating ?? 0), 0) / section.scores.length
        : 0;
      const label = section.id === 'b30' ? 'Best30' : section.id === 'new20' ? 'New20' : section.title;
      return `${label} ${average.toFixed(2)}`;
    }).join(' · ') || '暂无最佳成绩'
    : best.map((section) => `${section.title} ${section.records.length}`).join(' · ') || '暂无最佳成绩';
  const splitSync = payload.kind === 'maimai' && input.bundle.providerId !== 'local'
    || payload.kind === 'chunithm';
  const providerTitle = input.bundle.providerId
    ? PROVIDER_TITLES[input.bundle.providerId] ?? input.bundle.providerId
    : '未绑定';
  const syncSubtitle = payload.kind === 'chunithm' && input.bundle.providerId === 'lxns'
    ? payload.source?.label ?? providerTitle
    : providerTitle;
  const syncActions = splitSync
    ? [
      {
        title: '上传数据',
        subtitle: payload.kind === 'chunithm' ? '同步引导' : '好友码',
        accessibilityLabel: payload.kind === 'chunithm' ? '上传数据，打开同步引导' : undefined,
        action: { id: 'upload' as const, params: {} },
      },
      { title: '同步数据', subtitle: `当前 ${syncSubtitle}`, action: { id: 'sync' as const, params: {} } },
    ]
    : payload.kind === 'maimai' && input.bundle.providerId === 'local' ? [{
      title: '同步本地查分器数据',
      subtitle: '好友码',
      accessibilityLabel: '同步本地查分器数据，好友码',
      action: { id: 'upload' as const, params: {} },
    }] : [{
      title: '同步数据',
      subtitle: `当前 ${syncSubtitle}`,
      action: {
        id: input.bundle.providerId === 'local' ? 'upload' as const : 'sync' as const,
        params: {},
      },
    }];
  return {
    accountName: accountName(input.bundle),
    accountAction: { id: 'switch-account' as const, params: {} },
    infoCard: {
      label: playerScore.label,
      value: playerScore.display,
      meta: bestMeta,
      sideBadge,
    },
    syncActions,
    toolboxSummary: payload.kind === 'chunithm'
      ? '中二节奏工具正在准备中。'
      : summarizeGameTools(input.bundle.gameId),
    librarySummary: `收藏 ${input.favorites ?? 0} 首 · 练习 ${input.practice ?? 0} 张`,
    sources: [scoreSource(input.bundle), catalogSource(input)],
    currentVersion: currentVersion(input),
  };
}

export function buildGameDataDocument(input: AdapterInput): GameDataDocumentV1 {
  const gameId = input.bundle.gameId;
  const songs = gameId === 'maimai'
    ? (input.maimaiCatalog?.songs ?? []).map((song) => songFromMaimai(song, input.collections))
    : gameId === 'phigros'
      ? (input.phigrosCatalog?.songs ?? []).map(songFromPhigros)
      : gameId === 'chunithm'
        ? (input.chunithmCatalog?.songs ?? []).map(adaptChunithmSong)
        : [];
  const records = recordsForBundle(input, songs);
  const bestSections = bestForBundle(input, records, songs);
  return parseGameDataDocument({
    schema: GAME_MODEL_SCHEMA,
    gameId,
    overview: overview(input, bestSections),
    songs,
    records,
    bestSections,
  });
}
