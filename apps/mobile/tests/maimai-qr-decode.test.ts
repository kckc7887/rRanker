import { extractMaimaiQrPayload } from '@/services/maimai-qr-payload';

describe('extractMaimaiQrPayload', () => {
  it('提取 SGWCMAID 前缀的玩家二维码', () => {
    expect(extractMaimaiQrPayload('SGWCMAIDABC123')).toBe('SGWCMAIDABC123');
    expect(extractMaimaiQrPayload('前缀 SGWCMAIDXYZ/+_= 后缀')).toBe('SGWCMAIDXYZ/+_=');
  });

  it('空串或无关内容返回 null', () => {
    expect(extractMaimaiQrPayload('')).toBeNull();
    expect(extractMaimaiQrPayload('hello world')).toBeNull();
  });
});
