export type GameNoteValue = {
  key: string;
  label: string;
  /** 无数据时使用字符串占位。 */
  value: number | string;
};

export type GameNoteGroup = {
  key: string;
  label?: string;
  values: readonly GameNoteValue[];
};
