import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const MAX_BYTES = 1_048_576;
const MAX_DIM = 1024;

function validateImage(buf: Buffer): { kind: string; width: number; height: number } {
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    throw new Error(`entry.png byte length out of bounds: ${buf.length}`);
  }
  if (buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    if (buf.length < 33 || buf.subarray(12, 16).toString('ascii') !== 'IHDR') {
      throw new Error('entry.png missing valid PNG IHDR chunk');
    }
    if (!buf.subarray(buf.length - PNG_IEND.length).equals(PNG_IEND)) {
      throw new Error('entry.png missing valid PNG IEND trailer');
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width === 0 || height === 0 || width > MAX_DIM || height > MAX_DIM) {
      throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
    }
    return { kind: 'PNG', width, height };
  }
  if (buf.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    if (buf.length < 4 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
      throw new Error('entry.png missing valid JPEG EOI trailer');
    }
    return { kind: 'JPEG', width: MAX_DIM, height: MAX_DIM };
  }
  throw new Error('entry.png must be a valid PNG or JPEG image');
}

const rootDir = dirname(fileURLToPath(import.meta.url));
const srcPath = join(rootDir, 'entry.png');
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const bytes = readFileSync(srcPath);
const info = validateImage(bytes);
mkdirSync(outDir, { recursive: true });
const dstPath = join(outDir, 'entry.png');
writeFileSync(dstPath, bytes);
process.stdout.write(`wrote ${info.kind} ${info.width}x${info.height} (${bytes.length} bytes) to ${dstPath}\n`);
