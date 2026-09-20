export function fixtureOsu(mode: 0 | 1 | 2 | 3, version: string): string {
  const hard = version === 'Hard';
  const column = mode === 3 ? 64 : 256;
  const objects = hard
    ? Array.from({ length: 8 }, (_, index) => `${column + (mode === 3 ? 0 : index * 8)},192,${index * 120},1,0,0:0:0:0:`)
    : [`${column},192,0,1,0,0:0:0:0:`];
  return [
    'osu file format v14',
    '',
    '[General]',
    'AudioFilename: audio.mp3',
    'Mode: ' + String(mode),
    '',
    '[Metadata]',
    'Title: Preview',
    'Artist: rRanker',
    'Creator: rRanker',
    'Version: ' + version,
    '',
    '[Difficulty]',
    'HPDrainRate: ' + (hard ? '7' : '2'),
    'CircleSize: ' + (mode === 3 ? '4' : hard ? '6' : '3'),
    'OverallDifficulty: ' + (hard ? '8' : '2'),
    'ApproachRate: ' + (hard ? '9' : '2'),
    'SliderMultiplier: 1.4',
    'SliderTickRate: 1',
    '',
    '[TimingPoints]',
    '0,500,4,1,0,100,1,0',
    '',
    '[HitObjects]',
    ...objects,
    '',
  ].join('\n');
}

export function fixtureBytes(mode: 0 | 1 | 2 | 3, version: string): Uint8Array {
  return new TextEncoder().encode(fixtureOsu(mode, version));
}
