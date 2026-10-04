export const MAIMAI_MAINTENANCE_MESSAGE = '舞萌游戏服务器每日 04:00–07:00（UTC+8）维护，上传功能暂停，请在 07:00 后重试。';

/** 维护时间使用 UTC+8，无夏令时。 */
export function isMaimaiMaintenanceWindow(date = new Date()): boolean {
  const chinaHour = (date.getUTCHours() + 8) % 24;
  return chinaHour >= 4 && chinaHour < 7;
}
