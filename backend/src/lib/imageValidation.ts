// multer's fileFilter only trusts the client-declared Content-Type of the multipart part --
// an attacker can label any bytes an image mimetype and it sails through. This checks the
// actual file signature (the same magic-number check libraries like `file-type` use) so
// arbitrary content can't be stored in a PUBLIC bucket disguised as an image. Shared by
// every route that accepts an image upload (avatar photos, certificate images, ...) so this
// check isn't reimplemented (or subtly drifted) per route.
export function looksLikeImage(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= 8 && PNG_SIG.every((b, i) => buffer[i] === b);
  }
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}
