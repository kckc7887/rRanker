import { applyChartPreviewConfigToHtml, buildChartPreviewConfigJson } from '@/features/simai-chart-preview/chart-preview-inject';
import majdataCases from './fixtures/majdata-simai-cases.json';
import majdataReference from './fixtures/majdata-simai-reference.json';
import scoreReference from './fixtures/majdata-score-reference.json';
import { describe, expect, it, vi } from 'vitest';
import { MAJDATA_FILTER_DEFAULTS, MAJDATA_ORDER, MajdataSongSchema, filterMajdataRecords, majdataDefaultDifficulty, majdataRank, majdataTags, majdataTime, majdataTotals, matchesMajdataSong, type MajdataScore } from '@/domain/majdata';
import { MajdataProvider } from '@/providers/majdata-provider';
import { cookieHeader, responseCookies, isHttpCookieSession, type HttpCookieSession } from '@/providers/http-cookies';
import { chartLibraryKey, songLibraryKey } from '@/domain/user-library';
import { majdataRecentCard } from '@/features/game-content/adapters/majdata';
import { parseSimaiChart, parseSimaiBody, getAvailableDifficulties } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import { simaiStatistics } from '@/features/simai-chart-preview/statistics';
import { calculateAchievement, maximumSameErrors, singleNoteLoss, type BreakJudgment, type NormalJudgment } from '@/domain/tolerance';
import cases from './fixtures/maimai-simai-cases.json';
import reference from './fixtures/maimai-simai-reference.json';

const song = MajdataSongSchema.parse({ id: '0dff2974-9419-4290-bea9-307caa5825b7', title: 'Song', timestamp: '2026-09-01T00:00:00Z', hash: 'revision', levels: ['1', '3', '', '13+', '14.5', '15', '宴'], tags: ['A', 'B'], publicTags: ['B', 'C'] });
const record = (level: number, dx = 100, classic = 99): MajdataScore => ({ chartInfo: song, chartLevel: level, acc: { dx, classic }, dxScore: 200, hash: song.hash, timestamp: song.timestamp, comboState: 4 });
const session = (value: string): HttpCookieSession => ({ mode: 'http-cookies', persistable: true, origin: 'https://majdata.net', cookies: [{ name: 'auth', value, path: '/', secure: true }] });
const json = (value: unknown) => new Response(JSON.stringify(value));

describe('Majdata integration contracts', () => {
  it('uses form MD5 authentication and an explicit isolated Cookie header', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'auth=one; Path=/; Secure; HttpOnly' } })).mockResolvedValue(json({ username: 'player' }));
    const provider = new MajdataProvider(undefined, undefined, fetcher);
    const result = await provider.login({ username: 'player', password: 'password' });
    expect(result).toEqual(session('one'));
    const init = fetcher.mock.calls[0][1]; const body = init.body as FormData;
    expect(body.get('username')).toBe('player'); expect(body.get('password')).toBe('5f4dcc3b5aa765d61d8327deb882cf99'); expect(body.get('rememberMe')).toBe('true');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: 'omit' });
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('cookie')).toBe('auth=one');
    const second = vi.fn().mockResolvedValue(json({ username: 'other' }));
    await new MajdataProvider(session('two'), undefined, second).getPlayer();
    expect(new Headers(second.mock.calls[0][1].headers).get('cookie')).toBe('auth=two');
    expect(JSON.stringify(result)).not.toContain('password');
  });
  it('rejects authentication failures and cancels before publishing the response', async () => {
    const invalid = new MajdataProvider(undefined, undefined, vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(invalid.login({ username: 'p', password: 'p' })).rejects.toMatchObject({ code: 'authentication' });
    const controller = new AbortController();
    const fetcher = vi.fn(async () => { controller.abort(); return json({ username: 'old' }); });
    await expect(new MajdataProvider(session('one'), undefined, fetcher).getPlayer(controller.signal)).rejects.toBeDefined();
  });
  it('preserves cookie expiry, replacement, path and origin boundaries', () => {
    const cookies = responseCookies(new Response('', { headers: { 'set-cookie': 'auth=a; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/api3; Secure, other=b; Path=/' } }));
    expect(cookies).toHaveLength(2);
    const s = { ...session('a'), cookies };
    expect(cookieHeader(s, 'https://other.example/api3')).toBe('');
    expect(cookieHeader(s, 'https://majdata.net/api30')).toBe('other=b');
    expect(cookieHeader(s, 'https://majdata.net/api3/api')).toBe('auth=a; other=b');
    expect(responseCookies(new Response('', { headers: { 'set-cookie': 'auth=; Max-Age=0; Path=/api3' } }), cookies)).toHaveLength(1);
    expect(isHttpCookieSession(s)).toBe(true);
    expect(isHttpCookieSession({ ...s, cookies: [{ ...cookies[0], value: 'a\r\nX: value' }] })).toBe(false);
  });
  it('totals both percentages independently and filters difficulty OR, tag OR, and between groups', () => {
    expect(majdataTotals([record(3, 98.1251, 96), record(4, 100.0001, 101.5)])).toEqual({ dx: 198.1252, classic: 197.5 });
    expect(majdataTags(song)).toEqual(['A', 'B', 'C']);
    expect(filterMajdataRecords([record(3, 98), record(4, 100)], { ...MAJDATA_FILTER_DEFAULTS, difficulties: [3, 4], tags: ['C'], min: '99' })).toEqual([record(4, 100)]);
    expect(matchesMajdataSong(song, { ...MAJDATA_FILTER_DEFAULTS, difficulties: [2], tags: ['A'] })).toBe(false);
  });
  it('retains repeated Recent entries and missing metrics', () => {
    const recent = { chartId: song.id, title: song.title, artist: '', uploader: '', designer: '', level: 4, difficulty: '14.5', acc: 98, comboState: 1, timestamp: song.timestamp };
    expect(majdataRecentCard(recent, 0).key).not.toBe(majdataRecentCard(recent, 1).key);
    expect(majdataRecentCard(recent, 0).classic).toBeUndefined();
    expect([song.timestamp, '2026-09-02T00:00:00Z'].sort((a, b) => majdataTime(b) - majdataTime(a))[0]).toBe('2026-09-02T00:00:00Z');
  });
  it('never substitutes another difficulty or revision ranking', () => {
    const ranking = { hash: song.hash, scores: [[], [], [], [{ player: { username: 'player' }, acc: 100, comboState: 1 }], []] };
    expect(majdataRank(ranking, 'player', 3, song.hash)).toBe(1);
    expect(majdataRank(ranking, 'player', 4, song.hash)).toBeUndefined();
    expect(majdataRank(ranking, 'player', 3, 'new')).toBeUndefined();
  });
  it('keeps UUID identities and seven raw difficulty indices', () => {
    expect(songLibraryKey('majdata-net', song.id)).toContain(song.id);
    expect(chartLibraryKey('majdata-net', song.id, 'SD', 6)).not.toBe(chartLibraryKey('majdata-net', song.id, 'SD', 0));
    expect(majdataDefaultDifficulty(song)).toBe(5); expect(majdataDefaultDifficulty(song, 0)).toBe(0);
    expect(MAJDATA_ORDER).toEqual([5, 4, 3, 2, 1, 0, 6]);
    const text = Array.from({ length: 7 }, (_, i) => `&inote_${i + 1}=(120)${i + 1},`).join('\n');
    expect(Object.keys(getAvailableDifficulties(text))).toHaveLength(7);
    for (let i = 0; i < 7; i++) expect(parseSimaiChart(text, i + 1).notes[0].position).toBe(i + 1);
    expect(() => parseSimaiChart('&inote_5=(120)1,', 7)).toThrow();
  });
});

describe('Simai statistics against original MajSimai output', () => {
  for (const [name, body] of Object.entries({ ...cases, ...majdataCases })) it(name, () => {
    const expected = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, mine: 0 };
    const scoring = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0 };
    const add = (kind: 'tap' | 'hold' | 'slide' | 'touch', isBreak: boolean, mine: boolean) => { scoring[isBreak ? 'break' : kind]++; expected[mine ? 'mine' : isBreak ? 'break' : kind]++; };
    for (const timing of ({ ...reference, ...majdataReference })[name as keyof (typeof reference & typeof majdataReference)].notes) for (const n of timing.notes) {
      if (n.type === 1) { if (!n.IsSlideNoHead) add('tap', n.IsBreak, n.IsMine); add('slide', n.IsSlideBreak, n.IsMineSlide); }
      else add(n.type === 2 || n.type === 4 ? 'hold' : n.type === 3 ? 'touch' : 'tap', n.IsBreak, n.IsMine);
    }
    const actual = simaiStatistics(parseSimaiBody(body)); expect(actual.counts).toEqual(expected); expect(actual.scoring).toEqual(scoring);
  });
  it('distinguishes mixed mine weights and Classic caps, zero Break and empty charts', () => {
    const stats = simaiStatistics(parseSimaiBody('(120)1m,2hm[4:1],3?-7m[4:1],4bm,Chm[4:1],'));
    expect(stats.counts.mine).toBe(5); expect(stats.mines).toEqual({ tap: 1, hold: 2, slide: 1, touch: 0, break: 1 });
    expect(singleNoteLoss(stats.scoring, 'tap', 'miss', 'classic')).not.toBe(singleNoteLoss(stats.scoring, 'hold', 'miss', 'classic'));
    expect(calculateAchievement({ tap: 0, hold: 0, slide: 0, touch: 0, break: 1 }, {}, 'classic')).toBe(104);
    const noBreak = { tap: 100, hold: 0, slide: 0, touch: 0, break: 0 };
    expect(calculateAchievement(noBreak, {})).toBe(100); expect(maximumSameErrors(noBreak, 99, 'tap', 'miss')).toBe(1);
    expect(calculateAchievement({ ...noBreak, tap: 0 }, {}, 'classic')).toBe(0);
  });
});


describe('MajdataPlay original judgment method', () => {
  for (const sample of scoreReference) it(`${sample.kind} ${sample.isBreak ? 'Break' : 'normal'} ${sample.grade}`, () => {
    const kind = sample.isBreak ? 'break' : sample.kind === 'touch-hold' ? 'hold' : sample.kind as 'tap' | 'hold' | 'touch' | 'slide';
    const notes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, [kind]: 1 };
    let judgment: NormalJudgment | BreakJudgment = 'perfect';
    if (sample.grade === 'Miss' || sample.grade === 'TooFast') judgment = 'miss';
    else if (sample.grade.endsWith('Good')) judgment = 'good';
    else if (sample.grade.includes('Great')) judgment = !sample.isBreak ? 'great' : sample.grade.endsWith('3rd') ? 'great3' : sample.grade.endsWith('2nd') ? 'great2' : 'great1';
    else if (sample.isBreak) judgment = sample.grade === 'Perfect' ? 'criticalPerfect' : sample.grade.endsWith('2nd') ? 'perfect1' : 'perfect2';
    expect(calculateAchievement(notes, { [kind]: { [judgment]: 1 } }, 'dx')).toBeCloseTo(sample.dx, 8);
    expect(calculateAchievement(notes, { [kind]: { [judgment]: 1 } }, 'classic')).toBeCloseTo(sample.classic, 8);
  });
});


it('injects Simai strings without interpreting HTML endings or dollar replacements', () => {
  const simaiText = '&title=</script><script>throw 1</script>\n&inote_7=(120)1$$,2$,3-7[4:1],';
  const config = { chartId: 'uuid', difficulty: 7, simaiText };
  const safe = buildChartPreviewConfigJson(config); expect(JSON.parse(safe).simaiText).toBe(simaiText); expect(safe).not.toContain('</script>');
  const html = applyChartPreviewConfigToHtml('<!--CHART_PREVIEW_CONFIG-->', config);
  expect(html).toContain('1$$,2$'); expect(html.match(/<script>/g)).toHaveLength(1);
});
