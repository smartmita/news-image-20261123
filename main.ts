import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface ImageMetrics {
  encoding: 'png' | 'jpeg';
  width: number;
  height: number;
  byteCount: number;
}

const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_DIMENSION_PX = 1024;
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_TRAILER = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function parsePngDimensions(payload: Buffer): { width: number; height: number } {
  if (payload.length < 33 || payload.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('Malformed PNG: missing IHDR header');
  }
  if (!payload.subarray(payload.length - PNG_TRAILER.length).equals(PNG_TRAILER)) {
    throw new Error('Malformed PNG: missing IEND trailer');
  }
  return {
    width: payload.readUInt32BE(16),
    height: payload.readUInt32BE(20),
  };
}

function parseJpegDimensions(payload: Buffer): { width: number; height: number } {
  if (payload.length < 4 || payload[0] !== 0xff || payload[1] !== 0xd8) {
    throw new Error('Malformed JPEG: missing SOI marker');
  }
  if (payload[payload.length - 2] !== 0xff || payload[payload.length - 1] !== 0xd9) {
    throw new Error('Malformed JPEG: missing EOI marker');
  }
  let offset = 2;
  while (offset + 4 <= payload.length) {
    if (payload[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = payload[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > payload.length) break;
    const segLen = payload.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (offset + 9 <= payload.length) {
        return {
          height: payload.readUInt16BE(offset + 5),
          width: payload.readUInt16BE(offset + 7),
        };
      }
    }
    if (segLen < 2) break;
    offset += 2 + segLen;
  }
  throw new Error('Malformed JPEG: SOF frame dimensions not found');
}

function inspectBriefingImage(payload: Buffer): ImageMetrics {
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Image size ${payload.length} exceeds permitted range 1..${MAX_PAYLOAD_BYTES}`);
  }
  let encoding: 'png' | 'jpeg';
  let dims: { width: number; height: number };

  if (payload.subarray(0, PNG_HEADER.length).equals(PNG_HEADER)) {
    encoding = 'png';
    dims = parsePngDimensions(payload);
  } else if (payload[0] === 0xff && payload[1] === 0xd8 && payload[2] === 0xff) {
    encoding = 'jpeg';
    dims = parseJpegDimensions(payload);
  } else {
    throw new Error('Unsupported image encoding: expected PNG or JPEG');
  }

  if (dims.width < 1 || dims.height < 1 || dims.width > MAX_DIMENSION_PX || dims.height > MAX_DIMENSION_PX) {
    throw new Error(`Image dimensions ${dims.width}x${dims.height} exceed ${MAX_DIMENSION_PX}x${MAX_DIMENSION_PX}`);
  }

  return {
    encoding,
    width: dims.width,
    height: dims.height,
    byteCount: payload.length,
  };
}

function emitDailyBriefing(): void {
  const sourceAsset = resolve(import.meta.dirname, 'entry.png');
  const destinationDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  const assetBuffer = readFileSync(sourceAsset);
  const metrics = inspectBriefingImage(assetBuffer);

  mkdirSync(destinationDir, { recursive: true });
  const targetFile = join(destinationDir, 'entry.png');
  writeFileSync(targetFile, assetBuffer);
  console.log(
    `[2026-11-23 V5] Published ${metrics.encoding.toUpperCase()} ${metrics.width}x${metrics.height} (${metrics.byteCount} B) -> ${targetFile}`,
  );
}

emitDailyBriefing();
