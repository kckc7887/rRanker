import { describe, expect, it } from 'vitest';
import { TufPassSchema } from '@/domain/tuf';
import type { MuseDashRawScore } from '@/domain/muse-dash';
import {
  presentMuseDashApplicationBestImageCard,
  presentTufApplicationBestImageCard,
} from '@/features/best-image/community-best-image-presentation';

describe('community application best image presentations', () => {
  it('maps Muse Dash into ACC, relation and the two requested badge rows', () => {
    const score: MuseDashRawScore = {
      play: {
        uid: 'music_001', difficulty: 2, score: 999999, acc: 100, sum: 12.345,
        i: 1, platform: 'pc', character_uid: '1', elfin_uid: '2',
      },
      song: {
        uid: 'music_001', name: 'Song', author: 'Artist', cover: 'cover_001',
        levelDesigner: [], difficulty: ['1', '4', '8', '0', '0'], ChineseS: { name: '<歌曲>' },
      },
      albumTitle: 'Album', characterName: '角色', elfinName: '精灵', constant: 8.25,
    };
    const card = presentMuseDashApplicationBestImageCard(score, 0, 'data:image/png;base64,cover');
    expect(card.identifier).toBe('IDmusic_001');
    expect(card.title).toBe('<歌曲>');
    expect(card.primary.text).toBe('100.00%');
    expect(card.primary.label).toBeUndefined();
    expect(card.relation?.text).toBe('8.25 → 12.345');
    expect(card.badgeRows?.[0]?.map((badge) => badge.label)).toEqual(['S', 'AP', '#1']);
    expect(card.badgeRows?.[1]?.map((badge) => badge.label)).toEqual(['角色', '精灵', 'PC 端']);
    expect(card.palette.background).toBe('#EC4899');
  });

  it('omits missing optional Muse Dash badges without placeholders', () => {
    const score: MuseDashRawScore = {
      play: { uid: 'empty', difficulty: 4, score: 1, acc: 88.5, platform: 'mobile' },
      song: null, albumTitle: '', characterName: null, elfinName: null,
    };
    const card = presentMuseDashApplicationBestImageCard(score, undefined, null);
    expect(card.relation?.text).toBe('— → —');
    expect(card.badgeRows?.[0]?.map((badge) => badge.label)).toEqual(['A']);
    expect(card.badgeRows?.[1]?.map((badge) => badge.label)).toEqual(['移动端']);
    expect(card.palette.background).toBe('#FFFFFF');
    expect(card.palette.text).toBe('#111827');
  });

  it('maps TUF into ID, Score, difficulty to Impact, icon-only tags and value badges', () => {
    const pass = TufPassSchema.parse({
      id: 7, levelId: 42, scoreV2: 123.45, accuracy: 0.995, speed: 1,
      impact: 21.34, isWorldsFirst: true, isWorldsFirstPP: true,
      level: {
        id: 42, song: '<Level>', artist: '', tags: ['Featured', 'No icon'],
        difficulty: { id: 2, name: 'G12', type: 'PGU', color: '#F2A700' },
      },
    });
    const card = presentTufApplicationBestImageCard(pass, 'data:image/png;base64,cover', {
      Featured: 'data:image/png;base64,tag',
      'No icon': null,
    });
    expect(card.identifier).toBe('ID42');
    expect(card.title).toBe('<Level>');
    expect(card.primary).toMatchObject({ label: 'Score', text: '123.45' });
    expect(card.relation?.text).toBe('G12 → 21.34');
    expect(card.iconRow?.map((icon) => icon.label)).toEqual(['Featured']);
    expect(card.badgeRows?.[0]?.map((badge) => badge.label)).toEqual(['99.50%', '1.00×', 'WF', 'PP']);
    expect(card.palette.background).toBe('#F2A700');
  });

  it('uses only the existing special and unknown TUF difficulty palettes', () => {
    const base = {
      id: 7, levelId: 42, scoreV2: 123.45, accuracy: 99.5, speed: 1, impact: null,
      level: { id: 42, song: 'Level', artist: '', tags: [] },
    };
    const special = presentTufApplicationBestImageCard(TufPassSchema.parse({
      ...base,
      level: { ...base.level, difficulty: { id: 2, name: 'Legacy', type: 'LEGACY' } },
    }), 'data:image/png;base64,cover', {});
    const unknown = presentTufApplicationBestImageCard(TufPassSchema.parse(base), 'data:image/png;base64,cover', {});
    expect(special.palette.background).toContain('#37E6FF');
    expect(special.palette.background).toContain('#FF8A3D');
    expect(unknown.palette.background).toBe('#374151');
  });
});
