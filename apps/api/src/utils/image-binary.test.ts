import sharp from "sharp";
import { detectImageMime, extensionForMime, validateDownloadImage } from "./image-binary";

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };

void (async () => {
  for (const [format, mime, extension] of [["jpeg", "image/jpeg", "jpg"], ["png", "image/png", "png"], ["webp", "image/webp", "webp"]] as const) {
    const body = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#167a38" } }).toFormat(format).toBuffer();
    assert(detectImageMime(body) === mime, `${format} signature failed`);
    const result = await validateDownloadImage(body);
    assert(result.width === 8 && result.height === 8, `${format} decode failed`);
    assert(extensionForMime(result.mimeType) === extension, `${format} extension failed`);
  }
  assert(detectImageMime(Buffer.from('{"error":true}')) === null, "JSON must not be detected as image");
  await validateDownloadImage(Buffer.from("<html>error</html>")).then(() => { throw new Error("HTML must be rejected"); }, () => undefined);
  console.log("image binary tests passed");
})();
