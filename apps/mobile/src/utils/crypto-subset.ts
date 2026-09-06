// 深路径导入 crypto-js 实际用到的子模块。
// crypto-js 主入口为 CommonJS 全量导出（打包器无法摇树），仅按需引入：
// AES（Phigros 存档解密）、HmacSHA1/MD5（TapTap 签名）、Base64/Hex（编码互转）、
// core 的 WordArray（二进制与编码中介）。
import AES from 'crypto-js/aes.js';
import HmacSHA1 from 'crypto-js/hmac-sha1.js';
import MD5 from 'crypto-js/md5.js';
import Base64 from 'crypto-js/enc-base64.js';
import Hex from 'crypto-js/enc-hex.js';
import core from 'crypto-js/core.js';

/** core.lib.WordArray：加解密与编码互转的工厂。 */
export const WordArray = core.lib.WordArray;
export { AES, HmacSHA1, MD5, Base64, Hex };

export function uint8ArrayToWordArray(data: Uint8Array) {
  const words: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    words.push(((data[i] ?? 0) << 24) | ((data[i + 1] ?? 0) << 16)
      | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0));
  }
  return WordArray.create(words, data.length);
}

export function bytesToBase64(data: Uint8Array): string {
  return Base64.stringify(uint8ArrayToWordArray(data));
}
