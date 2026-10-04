import type { ChunithmLevelIndex } from './chunithm';

export const CHUNITHM_DIFFICULTY_THEME: Record<ChunithmLevelIndex, {
  background: string;
  border: string;
  text: string;
}> = {
  0: { background: '#4AA58A', border: '#4AA58A', text: '#FFFFFF' },
  1: { background: '#E27A24', border: '#E27A24', text: '#FFFFFF' },
  2: { background: '#D6403A', border: '#D6403A', text: '#FFFFFF' },
  3: { background: '#7526CF', border: '#7526CF', text: '#FFFFFF' },
  4: { background: '#17171A', border: '#E83A58', text: '#FFFFFF' },
  5: { background: '#7B61FF', border: '#F24FD4', text: '#FFFFFF' },
};

export const CHUNITHM_DIFFICULTY_CARD_VISUAL: Record<ChunithmLevelIndex, {
  color: string;
  tint: string;
  border?: string;
  darkAction?: string;
}> = {
  0: { color: '#4AA58A', tint: '#ECF8F3' },
  1: { color: '#E27A24', tint: '#FFF6E8' },
  2: { color: '#D6403A', tint: '#FFF0F0' },
  3: { color: '#7526CF', tint: '#F3EAFD' },
  4: { color: '#E83A58', tint: '#17171A', border: '#E83A58', darkAction: '#E83A58' },
  5: { color: '#7B61FF', tint: '#F3EEFF' },
};

export const CHUNITHM_DIFFICULTY_COLORS: Record<ChunithmLevelIndex, string> = {
  0: '#4AA58A',
  1: '#E27A24',
  2: '#D6403A',
  3: '#7526CF',
  4: '#17171A',
  5: '#7B61FF',
};
