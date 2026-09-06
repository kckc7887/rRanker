import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/** Recompress filtered scanlines without decoding pixels or changing color metadata. */
export function recompressPng(bytes) {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Invalid PNG signature');
  const chunks = [], idat = [];
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk');
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('Truncated PNG payload');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset, end);
    if (crc32(chunk.subarray(4, -4)) !== chunk.readUInt32BE(chunk.length - 4)) throw new Error(`Invalid PNG CRC: ${type}`);
    chunks.push({ type, bytes: chunk });
    if (type === 'IDAT') idat.push(chunk.subarray(8, -4));
    offset = end;
  }
  if (!idat.length || chunks.at(-1)?.type !== 'IEND') throw new Error('Incomplete PNG');
  const compressed = deflateSync(inflateSync(Buffer.concat(idat)), { level: 9 });
  const replacement = Buffer.alloc(compressed.length + 12);
  replacement.writeUInt32BE(compressed.length, 0);
  replacement.write('IDAT', 4, 'ascii');
  compressed.copy(replacement, 8);
  replacement.writeUInt32BE(crc32(replacement.subarray(4, -4)), replacement.length - 4);
  let inserted = false;
  const output = Buffer.concat([SIGNATURE, ...chunks.flatMap(chunk => {
    if (chunk.type !== 'IDAT') return [chunk.bytes];
    if (inserted) return [];
    inserted = true;
    return [replacement];
  })]);
  return output.length < bytes.length ? output : bytes;
}
