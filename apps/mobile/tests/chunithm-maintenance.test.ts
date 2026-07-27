import {
  isChunithmMaintenanceWindow,
} from '@/domain/chunithm-maintenance';

describe('chunithm maintenance window', () => {
  it('uses inclusive 04:00 and exclusive 07:00 in UTC+8', () => {
    expect(isChunithmMaintenanceWindow(new Date('2026-07-18T19:59:59.999Z'))).toBe(false);
    expect(isChunithmMaintenanceWindow(new Date('2026-07-18T20:00:00.000Z'))).toBe(true);
    expect(isChunithmMaintenanceWindow(new Date('2026-07-18T22:59:59.999Z'))).toBe(true);
    expect(isChunithmMaintenanceWindow(new Date('2026-07-18T23:00:00.000Z'))).toBe(false);
  });
});
