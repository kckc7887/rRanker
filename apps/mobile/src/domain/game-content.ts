export type GameNoteValue = {
  key: string;
  label: string;
  /** 判定/物量计数值；允许 string 以承载无数据占位符（如 osu 判定表的 '—'）。 */
  value: number | string;
};

export type GameNoteGroup = {
  key: string;
  label?: string;
  values: readonly GameNoteValue[];
};
