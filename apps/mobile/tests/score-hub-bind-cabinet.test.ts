const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

import { bindCabinetByQr, fetchMe } from '@/services/score-hub-client';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('score-hub bind cabinet', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('GET /me 读取绑定状态', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      friendCode: '123456789012345',
      hasCabinetUserId: true,
    }));
    await expect(fetchMe('tok')).resolves.toEqual({
      friendCode: '123456789012345',
      hasCabinetUserId: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/me'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('PUT /me/cabinet 201 视为绑定成功', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true }));
    await expect(bindCabinetByQr('tok', ' SGWCMAID1 ')).resolves.toEqual({
      ok: true,
      alreadyBound: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/me/cabinet'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ qrCode: 'SGWCMAID1' }),
      }),
    );
  });

  it('400 已绑定视为幂等成功', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: '该账号已绑定机台二维码' }));
    await expect(bindCabinetByQr('tok', 'SGWCMAID')).resolves.toEqual({
      ok: true,
      alreadyBound: true,
    });
  });

  it('409 成绩条数不足映射可读错误', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      matchedRows: 3,
      requiredRows: 10,
    }));
    await expect(bindCabinetByQr('tok', 'SGWCMAID')).rejects.toThrow(/3\/10/);
  });

  it('409 好友码不一致映射可读错误', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { verification: 'profile' }));
    await expect(bindCabinetByQr('tok', 'SGWCMAID')).rejects.toThrow(/好友码与当前登录账号不一致/);
  });
});
