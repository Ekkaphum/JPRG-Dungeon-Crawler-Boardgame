/** Minimal WebP header reader for the asset-contract tests.
 *
 *  The sprite sheets and effect strips are addressed by CSS background-position arithmetic over a
 *  fixed grid (4x5 for hero sheets, 4x1 for effect strips), so their exact pixel dimensions are a
 *  contract, not a detail — one wrong pixel shears every frame. Those tests used to assert the PNG
 *  IHDR directly; this keeps them reading real bytes off disk now that the assets are WebP, rather
 *  than trusting whatever produced them.
 *
 *  Deliberately not a dependency: the three container shapes below are the whole format surface
 *  these assets use, and a decoder in the test suite would be a much bigger thing to trust than
 *  thirty lines that fail loudly on anything unexpected. */

export interface WebpMeta {
  width: number;
  height: number;
  /** VP8 = lossy, VP8L = lossless, VP8X = extended container (what alpha images get). */
  format: 'VP8' | 'VP8L' | 'VP8X';
  /** VP8X only: the alpha flag in the feature byte. Undefined for the simple containers. */
  hasAlpha?: boolean;
}

export function readWebp(file: Buffer): WebpMeta {
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file (RIFF/WEBP magic missing)');
  }
  const fourcc = file.toString('ascii', 12, 16);

  if (fourcc === 'VP8X') {
    // 24-bit little-endian, stored as (dimension - 1).
    const width = (file[24] | (file[25] << 8) | (file[26] << 16)) + 1;
    const height = (file[27] | (file[28] << 8) | (file[29] << 16)) + 1;
    return { width, height, format: 'VP8X', hasAlpha: (file[20] & 0x10) !== 0 };
  }
  if (fourcc === 'VP8 ') {
    return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff, format: 'VP8' };
  }
  if (fourcc === 'VP8L') {
    // byte 20 is the 0x2f signature; the next 32 bits pack width-1:14, height-1:14, alpha:1, ver:3.
    if (file[20] !== 0x2f) throw new Error('VP8L signature byte missing');
    const bits = file.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      format: 'VP8L',
      hasAlpha: ((bits >>> 28) & 1) === 1,
    };
  }
  throw new Error(`unrecognised WebP chunk "${fourcc}"`);
}
