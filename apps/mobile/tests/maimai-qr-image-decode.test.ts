import { encode } from 'jpeg-js';
import decodeJpeg from 'jpeg-js/lib/decoder.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeMaimaiQrFromImageUri } from '@/services/maimai-qr-decode';

const mocks = vi.hoisted(() => ({ manipulate: vi.fn(), qr: vi.fn(), deleted: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({ manipulateAsync: mocks.manipulate, SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('jsqr', () => ({ default: mocks.qr }));
vi.mock('expo-file-system', () => ({ File: class { delete = mocks.deleted; } }));

const pixels = Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 13) % 256);
const jpeg = encode({ width: 8, height: 8, data: pixels }, 90).data;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.manipulate.mockResolvedValue({ uri: 'file://prepared.jpg', base64: jpeg.toString('base64') });
  mocks.qr.mockReturnValue({ data: 'SGWCMAIDABC123' });
});

describe('JPEG decoder subset in the shared QR service', () => {
  it('decodes a real JPEG into the same typed RGBA input used by QR recognition', async () => {
    const decoded = decodeJpeg(jpeg, { useTArray: true });
    expect(decoded.data).toBeInstanceOf(Uint8Array);
    expect(decoded.data).toHaveLength(8 * 8 * 4);
    await expect(decodeMaimaiQrFromImageUri('file://input.png')).resolves.toBe('SGWCMAIDABC123');
    expect(mocks.qr).toHaveBeenCalledWith(new Uint8ClampedArray(decoded.data), 8, 8, { inversionAttempts: 'attemptBoth' });
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it.each([null, { data: 'unrelated QR' }])('keeps recognition failure handling for %j', async result => {
    mocks.qr.mockReturnValue(result);
    await expect(decodeMaimaiQrFromImageUri('file://input.jpg')).rejects.toThrow(/二维码/);
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it('cleans up when the prepared JPEG cannot be decoded', async () => {
    mocks.manipulate.mockResolvedValue({ uri: 'file://prepared.jpg', base64: Buffer.from('not jpeg').toString('base64') });
    await expect(decodeMaimaiQrFromImageUri('file://input.jpg')).rejects.toThrow();
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it('does not prepare an image for an already cancelled operation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(decodeMaimaiQrFromImageUri('file://input.jpg', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.manipulate).not.toHaveBeenCalled();
  });

  it('cleans up without recognizing after cancellation during preparation', async () => {
    const controller = new AbortController();
    mocks.manipulate.mockImplementation(async () => {
      controller.abort();
      return { uri: 'file://prepared.jpg', base64: jpeg.toString('base64') };
    });
    await expect(decodeMaimaiQrFromImageUri('file://input.jpg', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });
});
