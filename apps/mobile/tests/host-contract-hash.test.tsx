/**
 * 结构合同辅助自身的合同（不渲染任何组件）：
 * - 规范序列化只取决于结构本身（对象键顺序无关）；
 * - 哈希是唯一门禁：基线缺失、基线内容不一致都不会改变通过/失败结论；
 * - 失败信息按路径区分 changed / added / removed，缺基线时给出显式生成命令。
 * 本文件不写仓库文件，因此也不会留下临时基线。
 */
import { describe, expect, it } from '@jest/globals';
import {
  canonicalizeContractTree,
  contractTreeHash,
  diffHostContractTrees,
  expectHostContract,
  formatHostContractDiff,
  hostContractBaselinePath,
  readHostContractBaseline,
} from './host-contract-hash';

const tree = [
  { type: 'View', props: { accessibilityLabel: '甲', style: { color: '#111827' } }, children: [] },
  { type: 'Text', props: { children: '标题' }, children: null },
];

describe('结构合同辅助的诊断能力', () => {
  it('规范序列化与对象键顺序无关，哈希只反映结构本身', () => {
    const reordered = [
      { children: [], props: { style: { color: '#111827' }, accessibilityLabel: '甲' }, type: 'View' },
      { children: null, props: { children: '标题' }, type: 'Text' },
    ];
    expect(contractTreeHash(tree)).toBe(contractTreeHash(reordered));
    expect(canonicalizeContractTree({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  });

  it('差异按路径区分 changed / added / removed', () => {
    const changed = JSON.parse(JSON.stringify(tree)) as typeof tree;
    (changed[0]!.props.style as { color: string }).color = '#B42318';
    (changed[1]!.props as Record<string, unknown>).accessibilityLabel = '新增文本';
    delete (changed[1]!.props as Record<string, unknown>).children;

    const { entries, truncated } = diffHostContractTrees(tree, changed);
    expect(truncated).toBe(false);
    expect(entries.map((entry) => [entry.kind, entry.path])).toEqual([
      ['changed', '[0].props.style.color'],
      ['added', '[1].props.accessibilityLabel'],
      ['removed', '[1].props.children'],
    ]);
    expect(formatHostContractDiff(entries)).toContain('[0].props.style.color: "#111827" → "#B42318"');
  });

  it('差异条数超过上限时截断并标记', () => {
    const wide = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`k${index}`, index]));
    const { entries, truncated } = diffHostContractTrees(wide, {}, { limit: 2 });
    expect(entries).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it('哈希一致即通过：基线缺失不会改变结论，也不会去读仓库文件', () => {
    expect(readHostContractBaseline('host-contract-hash/不存在')).toMatchObject({ status: 'missing' });
    expectHostContract({
      name: 'host-contract-hash/不存在',
      tree,
      expectedHash: contractTreeHash(tree),
    });
    expect(hostContractBaselinePath('host-contract-hash/不存在')).toContain('host-contract-baselines');
  });

  it('哈希不一致即失败：缺基线时给出可执行的生成命令', () => {
    let message = '';
    try {
      expectHostContract({
        name: 'host-contract-hash/不存在',
        tree,
        expectedHash: '0'.repeat(64),
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('结构哈希不一致：host-contract-hash/不存在');
    expect(message).toContain(`实际哈希：${contractTreeHash(tree)}`);
    expect(message).toContain('结构基线缺失');
    expect(message).toContain("$env:HOST_CONTRACT_UPDATE_BASELINE='1'; npx jest tests/host-contract-hash.test.tsx");
    expect(message).toContain('基线只用于诊断，不会改变本次判定');
  });
});
