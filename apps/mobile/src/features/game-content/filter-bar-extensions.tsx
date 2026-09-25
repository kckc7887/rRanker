import { DxRatingTagFilterRow } from '@/components/maimai/DxRatingTagFilterRow';

/**
 * 共享筛选条的游戏扩展行注册表（组合边界）。
 *
 * 共享筛选条只渲染扩展槽，不直接引用游戏组件；新增游戏扩展行在这里登记。
 * 目前登记舞萌的谱面标签筛选行：入口与弹层都在舞萌模块内。
 */
export const FILTER_BAR_EXTENSIONS = {
  tagFilterRow: DxRatingTagFilterRow,
} as const;
