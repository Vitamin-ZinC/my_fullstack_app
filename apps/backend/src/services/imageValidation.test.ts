import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectImage, validatePhotoBuffer } from "./imageValidation.js";

const repoRoot = join(process.cwd(), "../..");

const jpeg1x1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVEAEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEAMQAAAB9A//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
  "base64"
);

describe("image validation", () => {
  it("rejects tiny placeholder JPEG files", () => {
    const validation = validatePhotoBuffer(jpeg1x1);
    assert.equal(validation.ok, false);
    assert.match(validation.reason, /too small/i);
  });

  it("accepts real JPEG assets", () => {
    const photo = readFileSync(join(repoRoot, "assets", "ikigai-cones.jpg"));
    const image = inspectImage(photo);
    assert.deepEqual(image, { format: "jpeg", width: 1024, height: 925 });
    assert.equal(validatePhotoBuffer(photo).ok, true);
  });
});
