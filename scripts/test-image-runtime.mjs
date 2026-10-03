import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/frontend/package.json", import.meta.url));
const sharp = require("sharp");
const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 128, b: 255 } } }).png().toBuffer();
const webp = await sharp(png).resize(4, 4).webp().toBuffer();
const jpeg = await sharp(png).resize(4, 4).jpeg().toBuffer();
for (const [buffer, format, width] of [[png, "png", 8], [webp, "webp", 4], [jpeg, "jpeg", 4]]) {
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.format, format);
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, width);
}
console.log(`Image runtime passed: sharp ${sharp.versions.sharp}, Node.js ${process.version}, PNG/WebP/JPEG`);
