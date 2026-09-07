import { constants, deflateSync, inflateSync } from 'node:zlib';

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

function pack(type, payload) {
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write(type, 4, 'ascii');
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

function deflateSmallest(bytes) {
  let best;
  for (const memLevel of [8, 9]) for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED, constants.Z_RLE]) {
    const candidate = deflateSync(bytes, { level: 9, memLevel, strategy });
    if (!best || candidate.length < best.length) best = candidate;
  }
  return best;
}

/** Preserve filtered scanlines and every non-IDAT chunk byte, including XMP and color metadata. */
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
  const original = Buffer.concat(idat);
  const compressed = deflateSmallest(inflateSync(original));
  const replacement = pack('IDAT', compressed.length < original.length ? compressed : original);
  let inserted = false;
  const output = Buffer.concat([SIGNATURE, ...chunks.flatMap(chunk => {
    if (chunk.type !== 'IDAT') return [chunk.bytes];
    if (inserted) return [];
    inserted = true;
    return [replacement];
  })]);
  return output.length < bytes.length ? output : bytes;
}
