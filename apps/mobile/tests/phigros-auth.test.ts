import { describe, expect, it } from 'vitest';
import { pickLatestGameSave } from '@/providers/phigros-auth';

describe('pickLatestGameSave', () => {
  it('picks the save with the latest updatedAt', () => {
    const picked = pickLatestGameSave([
      {
        summary: 'old',
        gameFile: { url: 'https://example.com/old.save' },
        updatedAt: '2025-04-12T08:58:24.635Z',
      },
      {
        summary: 'new',
        gameFile: { url: 'https://example.com/new.save' },
        updatedAt: '2026-07-20T08:00:00.000Z',
      },
    ]);
    expect(picked.summaryBase64).toBe('new');
    expect(picked.saveUrl).toContain('new.save');
    expect(picked.updatedAt).toBe('2026-07-20T08:00:00.000Z');
  });

  it('ignores entries without gameFile url', () => {
    const picked = pickLatestGameSave([
      {
        summary: 'broken',
        gameFile: { url: '' },
        updatedAt: '2099-01-01T00:00:00.000Z',
      },
      {
        summary: 'ok',
        gameFile: { url: 'https://example.com/ok.save' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(picked.summaryBase64).toBe('ok');
  });

  it('throws when no valid saves exist', () => {
    expect(() => pickLatestGameSave([])).toThrow('云存档列表为空');
  });
});
