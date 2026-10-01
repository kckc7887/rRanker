
import { PlateProgressCard } from '@/components/PlateProgressCard';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';

import type { ScoreRecord } from '@/domain/models';
import { calculatePlateProgress } from '@/domain/plates';
import { usePlates } from '@/hooks/use-plates';

export function PinnedPlateCards({ plateIds, records }: { plateIds: readonly number[]; records: readonly ScoreRecord[]; }) {
  const plates = usePlates();
  const pinnedPlates = useMemo(() => {
    const plateById = new Map((plates.data?.plates ?? []).map((plate) => [plate.id, plate]));
    return plateIds.flatMap((plateId) => {
      const plate = plateById.get(plateId);
      return plate ? [plate] : [];
    });
  }, [plateIds, plates.data?.plates]);

  return pinnedPlates.map((plate) => (
    <Pressable
      key={plate.id}
      accessibilityRole="button"
      accessibilityLabel={`打开主页牌子 ${plate.name}`}
      onPress={() => router.push({
        pathname: '/tools/plates',
        params: { plateId: String(plate.id) },
      } as Href)}
    >
      <PlateProgressCard
        plate={plate}
        progress={calculatePlateProgress(plate, records)}
        eyebrow="牌子进度"
        testID={`overview-pinned-plate-${plate.id}`}
      />
    </Pressable>
  ));
}

