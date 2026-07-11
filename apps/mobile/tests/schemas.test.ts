import { DivingFishRecordsResponseSchema, mapDivingFishRecord } from '@/domain/schemas';
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
  });
  it('accepts the documented player-records envelope', () => {
    const payload = DivingFishRecordsResponseSchema.parse({
      nickname: '脱敏玩家', rating: 12345,
      records: [{ ...unknownEnumRawRecord, version: undefined }],
    });
    expect(payload.records).toHaveLength(1);
    expect(mapDivingFishRecord(payload.records[0], '已验证版本').version).toBe('已验证版本');
  });
});
