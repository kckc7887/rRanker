// crypto-js 深路径子模块的类型补充（@types/crypto-js 未提供深路径声明）。
// 运行时见 src/utils/crypto-subset.ts：深路径导入可避免 CommonJS 主入口全量进包。
declare module 'crypto-js/aes.js' {
  import CryptoJS from 'crypto-js';
  const AES: typeof CryptoJS.AES;
  export = AES;
}
declare module 'crypto-js/hmac-sha1.js' {
  import CryptoJS from 'crypto-js';
  const HmacSHA1: typeof CryptoJS.HmacSHA1;
  export = HmacSHA1;
}
declare module 'crypto-js/md5.js' {
  import CryptoJS from 'crypto-js';
  const MD5: typeof CryptoJS.MD5;
  export = MD5;
}
declare module 'crypto-js/enc-base64.js' {
  import CryptoJS from 'crypto-js';
  const Base64: typeof CryptoJS.enc.Base64;
  export = Base64;
}
declare module 'crypto-js/enc-hex.js' {
  import CryptoJS from 'crypto-js';
  const Hex: typeof CryptoJS.enc.Hex;
  export = Hex;
}
declare module 'crypto-js/core.js' {
  import CryptoJS from 'crypto-js';
  const core: typeof CryptoJS;
  export = core;
}
