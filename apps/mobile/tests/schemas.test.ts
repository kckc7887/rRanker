import {
  DivingFishRecordsResponseSchema,
  LxnsPlayerSchema,
  LxnsScoreSchema,
  mapDivingFishRecord,
} from '@/domain/schemas';
import { unknownEnumRawRecord } from '@/fixtures/sanitized';

describe('provider schema mapping', () => {
  it('preserves unknown enum values instead of dropping the record', () => {
    const record = mapDivingFishRecord(unknownEnumRawRecord);
    expect(record.difficulty).toBe('unknown'); expect(record.rawDifficulty).toBe('FutureDifficulty');
    expect(record.rawFc).toBe('future_fc'); expect(record.rawFs).toBe('future_fs');
    expect(record.rawRate).toBe('future_rate');
  });
  it('rejects missing required fields and malformed input', () => {
    expect(() => mapDivingFishRecord({ title: '缺字段样例' })).toThrow();
    expect(() => mapDivingFishRecord('not-json')).toThrow();
    expect(() => mapDivingFishRecord({ ...unknownEnumRawRecord, dxScore: undefined })).toThrow();
    expect(() => LxnsScoreSchema.parse({
      id: 1, level_index: 3, achievements: 100, type: 'dx',
    })).toThrow();
  });
  it('keeps provider DXScore fields as the player actual score', () => {
    expect(mapDivingFishRecord({ ...unknownEnumRawRecord, dxScore: 1836 }).dxScore).toBe(1836);
    expect(LxnsScoreSchema.parse({
      id: 1, level_index: 3, achievements: 100, type: 'dx', dx_score: 1836,
    }).dx_score).toBe(1836);
  });
  it('accepts the documented player-records envelope', () => {
    const payload = DivingFishRecordsResponseSchema.parse({
      nickname: '脱敏玩家', rating: 12345,
      records: [{ ...unknownEnumRawRecord, version: undefined }],
    });
    expect(payload.records).toHaveLength(1);
    expect(mapDivingFishRecord(payload.records[0], '已验证版本').version).toBe('已验证版本');
  });
  it('accepts LXNS player presentation fields', () => {
    const player = LxnsPlayerSchema.parse({
      name: '脱敏玩家', rating: 15001, friend_code: 123456789,
      icon: { id: 200201, name: '头像' },
      name_plate: { id: 300101, name: '姓名框' },
      trophy: { id: 300022, name: '称号', color: 'Rainbow' },
    });
    expect(player.icon?.id).toBe(200201);
    expect(player.name_plate?.id).toBe(300101);
    expect(player.trophy).toMatchObject({ name: '称号', color: 'Rainbow' });
  });
});
