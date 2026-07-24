import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import jsQR from 'jsqr';
import { extractMaimaiQrPayload } from '@/services/maimai-qr-payload';

export { extractMaimaiQrPayload } from '@/services/maimai-qr-payload';

export class QrDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrDecodeError';
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node / Jest 回退
  return Uint8Array.from(Buffer.from(normalized, 'base64'));
}

/**
 * 将相册图片本地解码为舞萌玩家二维码字符串。
 * 先压成 JPEG 再交给 jsQR，避免把大图原文件直接塞给解码器。
 */
export async function decodeMaimaiQrFromImageUri(uri: string): Promise<string> {
  const prepared = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  if (!prepared.base64) {
    throw new QrDecodeError('无法读取所选图片');
  }

  const bytes = base64ToUint8Array(prepared.base64);
  const decoded = jpeg.decode(bytes, { useTArray: true });
  if (!decoded.width || !decoded.height || !decoded.data?.length) {
    throw new QrDecodeError('图片解码失败');
  }

  const code = jsQR(
    new Uint8ClampedArray(decoded.data),
    decoded.width,
    decoded.height,
    { inversionAttempts: 'attemptBoth' },
  );
  if (!code?.data) {
    throw new QrDecodeError('未识别到二维码，请换一张更清晰的截图');
  }

  const payload = extractMaimaiQrPayload(code.data);
  if (!payload) {
    throw new QrDecodeError('识别到的不是舞萌玩家二维码，请确认截图内容');
  }
  return payload;
}
