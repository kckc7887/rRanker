import { readFileSync } from 'node:fs';
import {
  ActionRefSchema,
  GameDataDocumentV1Schema,
  GameManifestV1Schema,
  GAME_MODEL_SCHEMA,
  parseGameManifest,
  validateGameModelContract,
} from '@/domain/game-model';
import { getGameManifest } from '@/domain/game-manifests';

describe('rranker-game-model/v1 schema', () => {
  const example = (name: string) => JSON.parse(readFileSync(
    new URL(`../../../docs/examples/rranker-game-model-v1/${name}`, import.meta.url),
    'utf8',
  ));

  it('parses the documented legal JSON examples and validates cross references', () => {
    const manifest = GameManifestV1Schema.parse(example('manifest.valid.json'));
    const document = GameDataDocumentV1Schema.parse(example('document.valid.json'));
    expect(validateGameModelContract(manifest, document)).toEqual({ manifest, document });
  });

  it('rejects the documented illegal JSON examples', () => {
    expect(() => GameManifestV1Schema.parse(example('manifest.invalid-axis.json'))).toThrow();
    expect(() => GameManifestV1Schema.parse(example('manifest.invalid-action.json'))).toThrow();
  });

  it('accepts every built-in manifest as JSON', () => {
    for (const gameId of ['maimai', 'phigros', 'chunithm', 'test'] as const) {
      const manifest = getGameManifest(gameId);
      expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
      expect(GameManifestV1Schema.parse(manifest).schema).toBe(GAME_MODEL_SCHEMA);
    }
  });

  it('requires exactly one difficulty axis and at most one type axis', () => {
    const base = structuredClone(getGameManifest('maimai'));
    expect(() => parseGameManifest({
      ...base,
      tagGroups: base.tagGroups.filter((group) => group.role !== 'difficulty-axis'),
    })).toThrow('必须且只能');
    const typeAxis = base.tagGroups.find((group) => group.role === 'type-axis');
    expect(typeAxis).toBeDefined();
    expect(() => parseGameManifest({
      ...base,
      tagGroups: [...base.tagGroups, { ...typeAxis, id: 'second-type' }],
    })).toThrow('最多注册一个类型');
  });

  it('rejects duplicate group/item ids and malformed flowing gradients', () => {
    const base = structuredClone(getGameManifest('phigros'));
    expect(() => parseGameManifest({
      ...base,
      tagGroups: [...base.tagGroups, base.tagGroups[0]],
    })).toThrow('标签组 ID 必须唯一');
    const difficulty = structuredClone(base.tagGroups[0]!);
    difficulty.items.push({ ...difficulty.items[0]! });
    expect(() => parseGameManifest({
      ...base,
      tagGroups: [difficulty, ...base.tagGroups.slice(1)],
    })).toThrow('标签 ID 必须唯一');
    difficulty.items[0]!.style = {
      text: {
        fill: {
          kind: 'gradient',
          colors: ['#000000', '#FFFFFF'],
          animated: true,
          direction: 'horizontal',
        },
      },
    };
    expect(() => parseGameManifest({
      ...base,
      tagGroups: [difficulty, ...base.tagGroups.slice(1)],
    })).toThrow('durationMs');
  });

  it('disables outer style when a tag value is another tag group', () => {
    const base = structuredClone(getGameManifest('test'));
    const difficulty = base.tagGroups[0]!;
    difficulty.items[0]!.defaultValue = {
      kind: 'tag-group',
      value: {
        groupId: 'nested',
        items: [{ itemId: 'value', value: { kind: 'int', value: 1 } }],
      },
    };
    expect(() => parseGameManifest(base)).toThrow('外层标签样式必须省略');
  });

  it('only accepts whitelisted actions', () => {
    expect(ActionRefSchema.parse({ id: 'sync', params: {} })).toEqual({ id: 'sync', params: {} });
    expect(() => ActionRefSchema.parse({ id: 'eval', params: { code: 'alert(1)' } })).toThrow();
  });

  it('rejects mismatched game ids and invalid cross-document tag references', () => {
    const manifest = GameManifestV1Schema.parse(example('manifest.valid.json'));
    const document = GameDataDocumentV1Schema.parse(example('document.valid.json'));
    expect(() => validateGameModelContract(manifest, {
      ...document,
      gameId: 'maimai',
    })).toThrow('游戏 ID 不一致');
    const broken = structuredClone(document);
    broken.songs[0]!.chartGroups[0]!.charts[0]!.difficulty.itemId = 'missing';
    expect(() => validateGameModelContract(manifest, broken)).toThrow('不存在的标签项');
  });
});
