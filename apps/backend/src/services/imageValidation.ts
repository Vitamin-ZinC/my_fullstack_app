export const MIN_PHOTO_BYTES = 8 * 1024;
export const MIN_PHOTO_DIMENSION = 160;

type ImageInfo = {
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
};

type PhotoValidation =
  | ({ ok: true } & ImageInfo)
  | { ok: false; reason: string };

export function validatePhotoBuffer(buffer: Buffer): PhotoValidation {
  if (buffer.length < MIN_PHOTO_BYTES) {
    return { ok: false, reason: "Uploaded photo is too small. Please upload or retake a real photo." };
  }

  const image = inspectImage(buffer);
  if (!image) {
    return { ok: false, reason: "Uploaded photo is not a supported JPEG, PNG, or WebP image." };
  }

  if (image.width < MIN_PHOTO_DIMENSION || image.height < MIN_PHOTO_DIMENSION) {
    return {
      ok: false,
      reason: `Uploaded photo dimensions are too small (${image.width}x${image.height}). Please upload or retake a larger photo.`
    };
  }

  return { ok: true, ...image };
}

export function inspectImage(buffer: Buffer): ImageInfo | null {
  return inspectJpeg(buffer) ?? inspectPng(buffer) ?? inspectWebp(buffer);
}

function inspectJpeg(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = buffer[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < buffer.length) {
      marker = buffer[offset];
      offset += 1;
    }

    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    if (isJpegStartOfFrame(marker) && offset + 7 <= buffer.length) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { format: "jpeg", width, height } : null;
    }

    offset += segmentLength;
  }

  return null;
}

function isJpegStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function inspectPng(buffer: Buffer): ImageInfo | null {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) return null;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { format: "png", width, height } : null;
}

function inspectWebp(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
    return null;
  }

  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { format: "webp", width, height };
  }

  if (chunk === "VP8 " && buffer.length >= 30) {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { format: "webp", width, height } : null;
  }

  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    const width = 1 + (bits & 0x3fff);
    const height = 1 + ((bits >> 14) & 0x3fff);
    return { format: "webp", width, height };
  }

  return null;
}
