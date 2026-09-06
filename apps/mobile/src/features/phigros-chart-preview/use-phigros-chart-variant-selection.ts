import { useEffect, useState } from 'react';
import { useNotification } from '@/components/AppNotification';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { loadPhigrosChartPreviewVariants, phigrosChartPreviewLevelLabel } from '@/domain/phigros-chart-preview';
import type { PhigrosChartPreviewInput } from './chart-preview-input';

type Selection = { target: PhigrosChartPreviewInput; variantIndex?: number; error?: string };

export function usePhigrosChartVariantSelection(target: PhigrosChartPreviewInput | null) {
  const { showActionNotification, dismissNotification } = useNotification();
  const { foregroundReady } = useAppLifecycle();
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    if (!target || !foregroundReady || selection?.target === target) return;
    const controller = new AbortController();
    const notifications = new Set<number>();
    const select = (variantIndex?: number) => {
      if (!controller.signal.aborted) setSelection({ target, variantIndex });
    };
    const prompt = (variants: number[]) => {
      if (controller.signal.aborted) return;
      notifications.add(showActionNotification({
        title: '这首歌有里谱',
        message: '是否查看里谱？',
        actions: [
          { label: '继续播放谱面', tone: 'cancel', onPress: () => select() },
          { label: '查看里谱', onPress: () => {
            if (controller.signal.aborted) return;
            notifications.add(showActionNotification({
              title: '选择里谱',
              message: '请选择要查看的里谱。',
              actions: [
                ...variants.map((variantIndex) => ({ label: `里谱 ${variantIndex}`, onPress: () => select(variantIndex) })),
                { label: '返回', tone: 'cancel', onPress: () => prompt(variants) },
              ],
            }));
          } },
        ],
      }));
    };
    void loadPhigrosChartPreviewVariants({
      songId: target.songId, difficulty: phigrosChartPreviewLevelLabel(target.levelIndex),
    }, controller.signal).then((variants) => {
      if (variants.length > 1 && variants.some((value) => value !== 0)) prompt(variants.filter((value) => value !== 0));
      else select();
    }).catch(() => {
      if (!controller.signal.aborted) setSelection({ target, error: '暂时无法读取谱面，请稍后重试。' });
    });
    return () => {
      controller.abort();
      notifications.forEach(dismissNotification);
    };
  }, [target, foregroundReady, selection, showActionNotification, dismissNotification]);
  return selection?.target === target ? selection : null;
}
