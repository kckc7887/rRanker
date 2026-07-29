import { useMemo } from 'react';
import { buildGameDataDocument } from '@/domain/game-model-adapters';
import { getGameManifest } from '@/domain/game-manifests';
import {
  validateGameModelContract,
  type GameDataDocumentV1,
} from '@/domain/game-model';
import { useChunithmCatalog } from './use-chunithm-catalog';
import { useDetailedCatalog } from './use-detailed-catalog';
import { useGameData } from './use-game-data';
import { usePhigrosCatalog } from './use-phigros-catalog';
import { useUserLibrary } from './use-user-library';
import { useCollections } from './use-collections';

export function useGameModel() {
  const gameData = useGameData();
  const maimaiCatalog = useDetailedCatalog();
  const phigrosCatalog = usePhigrosCatalog();
  const chunithmCatalog = useChunithmCatalog();
  const library = useUserLibrary();
  const collections = useCollections();
  const gameId = gameData.activeGameId ?? gameData.data?.gameId ?? 'test';
  const manifest = getGameManifest(gameId);

  const result = useMemo<{ document?: GameDataDocumentV1; error?: Error }>(() => {
    if (!gameData.data) return {};
    try {
      const favorites = (library.data ?? [])
        .filter((item) => item.kind === 'song' && item.favorite).length;
      const practice = (library.data ?? [])
        .filter((item) => item.kind === 'chart' && item.practice).length;
      const document = buildGameDataDocument({
          bundle: gameData.data,
          maimaiCatalog: maimaiCatalog.data,
          phigrosCatalog: phigrosCatalog.data?.snapshot,
          chunithmCatalog: chunithmCatalog.data,
          favorites,
          practice,
          collections: collections.data?.items,
        });
      validateGameModelContract(manifest, document);
      return { document };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('统一游戏模型构建失败');
      if (process.env.NODE_ENV !== 'production') {
        console.error(normalized);
      }
      return {
        error: process.env.NODE_ENV === 'production'
          ? new Error('游戏配置不可用')
          : normalized,
      };
    }
  }, [
    chunithmCatalog.data,
    collections.data?.items,
    gameData.data,
    library.data,
    manifest,
    maimaiCatalog.data,
    phigrosCatalog.data?.snapshot,
  ]);

  const catalogQuery = gameId === 'maimai'
    ? maimaiCatalog
    : gameId === 'phigros'
      ? phigrosCatalog
      : gameId === 'chunithm'
        ? chunithmCatalog
        : null;
  const isLoading = gameData.isLoading || !!catalogQuery?.isLoading;
  const error = result.error ?? gameData.error ?? catalogQuery?.error;
  const refetch = async () => {
    await Promise.all([
      gameData.refetch(),
      ...(catalogQuery ? [catalogQuery.refetch()] : []),
    ]);
  };

  return {
    manifest,
    document: result.document,
    isLoading,
    isError: !!error,
    error,
    refetch,
    library,
  };
}
