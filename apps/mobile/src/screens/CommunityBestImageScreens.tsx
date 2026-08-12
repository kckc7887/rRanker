import { useQueries } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FixedBestImageScreen } from '@/components/FixedBestImageScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { museDashUserIdFromAccountId, tufPlayerIdFromAccountId } from '@/domain/bound-account';
import {
  buildMuseDashRawScores,
  museDashCoverUrl,
  sortMuseDashRawScores,
  type MuseDashRawScore,
} from '@/domain/muse-dash';
import {
  resolveTufAvatarUrl,
  selectTufTopPasses,
  tufMediaImageCandidates,
  tufTagIconUrl,
  type TufPass,
} from '@/domain/tuf';
import { buildFixedBestImageHtml } from '@/features/best-image/build-fixed-best-image-html';
import {
  presentMuseDashApplicationBestImageCard,
  presentTufApplicationBestImageCard,
} from '@/features/best-image/community-best-image-presentation';
import { loadBestImageAssetDataUri } from '@/features/best-image/load-best-image-assets';
import {
  loadFirstRemoteBestImageAssetDataUri,
  loadRemoteBestImageAssetDataUri,
} from '@/features/best-image/load-remote-best-image-asset';
import {
  useMuseDashAlbums,
  useMuseDashCe,
  useMuseDashDiffdiff,
  useMuseDashPlayDetails,
  useMuseDashPlayer,
} from '@/hooks/use-muse-dash';
import { tufVideoDetailsQueryOptions, useTufPasses, useTufProfile } from '@/hooks/use-tuf';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const ADOFAI_ICON = require('../../assets/images/adofai.png') as number;

type PreparedAssets<T> = {
  data: T | null;
  error: Error | null;
  done: number;
  total: number;
};

function usePreparedAssets<T>({
  enabled,
  key,
  load,
  retryToken,
}: {
  enabled: boolean;
  key: string;
  load: (onProgress: (done: number, total: number) => void) => Promise<T>;
  retryToken: number;
}): PreparedAssets<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<PreparedAssets<T>>({ data: null, error: null, done: 0, total: 0 });
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setState({ data: null, error: null, done: 0, total: 0 });
      return;
    }
    setState({ data: null, error: null, done: 0, total: 0 });
    void loadRef.current((done, total) => {
      if (!cancelled) setState((current) => ({ ...current, done, total }));
    }).then((data) => {
      if (!cancelled) setState((current) => ({ ...current, data, error: null }));
    }).catch((error: unknown) => {
      if (!cancelled) setState((current) => ({
        ...current,
        error: error instanceof Error ? error : new Error('成绩图素材准备失败'),
      }));
    });
    return () => { cancelled = true; };
  }, [enabled, key, retryToken]);
  return state;
}

function EmptyBestImage({ text }: { text: string }) {
  const theme = useAppTheme();
  return <View style={[styles.center, { backgroundColor: theme.background }]}><Text style={{ color: theme.textMuted }}>{text}</Text></View>;
}

type TufImageAssets = {
  avatar: string;
  covers: Readonly<Record<number, string>>;
  tagIcons: Readonly<Record<string, string | null>>;
};

export function TufBestImageScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const playerId = tufPlayerIdFromAccountId(accountId);
  const profile = useTufProfile(playerId);
  const passes = useTufPasses(playerId, { sortBy: 'impact', order: 'DESC', bestPerLevel: true });
  const [assetRetry, setAssetRetry] = useState(0);
  const top = useMemo(() => selectTufTopPasses(
    profile.data?.topScores ?? [],
    passes.data?.pages.flatMap((page) => page.passes) ?? [],
  ), [passes.data?.pages, profile.data?.topScores]);
  const ordered = top.passes;
  const mediaQueries = useQueries({
    queries: ordered.map((pass) => tufVideoDetailsQueryOptions(pass.level.videoLink)),
  });
  const mediaImages = mediaQueries.map((query) => query.data?.image ?? null);
  const mediaKey = mediaImages.join('|');
  const assetKey = `${resolveTufAvatarUrl(profile.data) ?? ''}|${ordered.map((pass) => pass.id).join(',')}|${mediaKey}`;
  const loadAssets = useCallback(async (onProgress: (done: number, total: number) => void): Promise<TufImageAssets> => {
    const tagNames = [...new Set(ordered.flatMap((pass) => pass.level.tags.map((tag) => (
      typeof tag === 'string' ? tag : tag.name
    ))).filter((name) => tufTagIconUrl(name) !== null))];
    const total = ordered.length + tagNames.length + 2;
    let done = 0;
    onProgress(done, total);
    const localIcon = await loadBestImageAssetDataUri(ADOFAI_ICON);
    done += 1;
    onProgress(done, total);
    const avatar = await loadRemoteBestImageAssetDataUri(resolveTufAvatarUrl(profile.data)) ?? localIcon;
    done += 1;
    onProgress(done, total);
    const covers: Record<number, string> = {};
    for (const [index, pass] of ordered.entries()) {
      covers[pass.id] = await loadFirstRemoteBestImageAssetDataUri(
        tufMediaImageCandidates(mediaImages[index], pass.level.difficulty?.icon),
      ) ?? localIcon;
      done += 1;
      onProgress(done, total);
    }
    const tagIcons: Record<string, string | null> = {};
    for (const name of tagNames) {
      tagIcons[name] = await loadRemoteBestImageAssetDataUri(tufTagIconUrl(name));
      done += 1;
      onProgress(done, total);
    }
    return { avatar, covers, tagIcons };
  }, [mediaImages, ordered, profile.data]);
  const assets = usePreparedAssets({ enabled: ordered.length > 0, key: assetKey, load: loadAssets, retryToken: assetRetry });
  const remoteTagIcons = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const pass of ordered) {
      for (const tag of pass.level.tags) {
        const name = typeof tag === 'string' ? tag : tag.name;
        if (map[name] === undefined) map[name] = tufTagIconUrl(name);
      }
    }
    return map;
  }, [ordered]);
  const cards = useMemo(() => ordered.map((pass, index) => presentTufApplicationBestImageCard(
    pass,
    assets.data
      ? assets.data.covers[pass.id]!
      : (tufMediaImageCandidates(mediaImages[index], pass.level.difficulty?.icon)[0] ?? null),
    assets.data ? assets.data.tagIcons : remoteTagIcons,
  )), [assets.data, mediaImages, ordered, remoteTagIcons]);
  const htmlForWidth = useCallback((width: number) => buildFixedBestImageHtml({
    width,
    playerName: profile.data?.name ?? 'TUF 玩家',
    ratingDisplay: profile.data?.rankedScore.toFixed(2) ?? '—',
    avatarUri: assets.data?.avatar ?? resolveTufAvatarUrl(profile.data),
    sectionTitle: `Top${cards.length}`,
    cards,
    dataSource: 'TUF',
  }), [assets.data?.avatar, cards, profile.data]);
  const loading = profile.isLoading || passes.isLoading;
  const error = profile.error ?? passes.error;
  const preparing = assets.data === null && assets.error === null && assets.total > 0
    ? { done: assets.done, total: assets.total }
    : null;
  if (playerId === null) return <EmptyBestImage text="请先绑定 TUF 玩家" />;
  if (loading) return <EmptyBestImage text="正在准备 TopN 成绩图" />;
  return <QueryStateView<TufPass[]>
    data={!error && ordered.length ? ordered : undefined}
    emptyText="当前公开资料没有可导出的 Top20 成绩"
    error={error}
    isEmpty={!error && ordered.length === 0}
    isError={!!error}
    isLoading={false}
    onRetry={() => {
      void profile.refetch();
      void passes.refetch();
      mediaQueries.forEach((query) => { void query.refetch(); });
      setAssetRetry((value) => value + 1);
    }}
    renderData={() => <FixedBestImageScreen
      disabled={cards.length === 0 || (assets.data === null && assets.error === null)}
      htmlForWidth={htmlForWidth}
      imageType="top20"
      notice={top.missing > 0 ? `有 ${top.missing} 条 Top 记录未公开，已跳过。` : null}
      playerName={profile.data?.name ?? 'TUF 玩家'}
      preparing={preparing}
    />}
  />;
}

type MuseDashImageAssets = { covers: Readonly<Record<string, string | null>> };

export function MuseDashBestImageScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const userId = museDashUserIdFromAccountId(accountId);
  const player = useMuseDashPlayer(userId);
  const albums = useMuseDashAlbums();
  const ce = useMuseDashCe();
  const diffdiff = useMuseDashDiffdiff();
  const [assetRetry, setAssetRetry] = useState(0);
  const ordered = useMemo(() => player.data
    ? sortMuseDashRawScores(buildMuseDashRawScores(player.data, albums.data, ce.data, diffdiff.data)).slice(0, 30)
    : [], [albums.data, ce.data, diffdiff.data, player.data]);
  const detailItems = useMemo(() => ordered.map((score) => ({
    uid: score.play.uid,
    difficulty: score.play.difficulty,
    platform: score.play.platform ?? 'mobile',
  })), [ordered]);
  const missMap = useMuseDashPlayDetails(detailItems, userId, ordered.length > 0);
  const coverKey = ordered.map((score) => `${score.play.uid}:${score.song?.cover ?? ''}`).join('|');
  const loadAssets = useCallback(async (onProgress: (done: number, total: number) => void): Promise<MuseDashImageAssets> => {
    const unique = [...new Map(ordered.map((score) => [score.play.uid, score])).values()];
    const covers: Record<string, string | null> = {};
    onProgress(0, unique.length);
    for (const [index, score] of unique.entries()) {
      covers[score.play.uid] = await loadRemoteBestImageAssetDataUri(museDashCoverUrl(score.song?.cover));
      onProgress(index + 1, unique.length);
    }
    return { covers };
  }, [ordered]);
  const assets = usePreparedAssets({ enabled: ordered.length > 0, key: coverKey, load: loadAssets, retryToken: assetRetry });
  const cards = useMemo(() => ordered.map((score) => presentMuseDashApplicationBestImageCard(
    score,
    missMap.get(`${score.play.uid}:${score.play.difficulty}`),
    assets.data ? assets.data.covers[score.play.uid] ?? null : museDashCoverUrl(score.song?.cover),
  )), [assets.data, missMap, ordered]);
  const htmlForWidth = useCallback((width: number) => buildFixedBestImageHtml({
    width,
    playerName: player.data?.user.nickname ?? '喵斯快跑玩家',
    ratingDisplay: player.data?.rl?.toFixed(2) ?? '—',
    sectionTitle: `Best${cards.length}`,
    cards,
    dataSource: 'MuseDash.moe',
  }), [cards, player.data]);
  const loading = player.isLoading || albums.isLoading || ce.isLoading || diffdiff.isLoading;
  const error = player.error ?? albums.error ?? ce.error ?? diffdiff.error;
  const preparing = assets.data === null && assets.error === null && assets.total > 0
    ? { done: assets.done, total: assets.total }
    : null;
  if (userId === null) return <EmptyBestImage text="请先绑定喵斯快跑玩家" />;
  if (loading) return <EmptyBestImage text="正在准备 BestN 成绩图" />;
  return <QueryStateView<MuseDashRawScore[]>
    data={!error && ordered.length ? ordered : undefined}
    emptyText="当前没有可导出的喵斯快跑成绩"
    error={error}
    isEmpty={!error && ordered.length === 0}
    isError={!!error}
    isLoading={false}
    onRetry={() => {
      void player.refetch();
      void albums.refetch();
      void ce.refetch();
      void diffdiff.refetch();
      setAssetRetry((value) => value + 1);
    }}
    renderData={() => <FixedBestImageScreen
      disabled={cards.length === 0 || (assets.data === null && assets.error === null)}
      htmlForWidth={htmlForWidth}
      imageType="best30"
      playerName={player.data?.user.nickname ?? '喵斯快跑玩家'}
      preparing={preparing}
    />}
  />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
