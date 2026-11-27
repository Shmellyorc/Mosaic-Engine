export function inspectWav(bytes: Uint8Array) {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => input.getUint32(offset);
  const u16 = (offset: number) => input.getUint16(offset, true);
  const u32 = (offset: number) => input.getUint32(offset, true);
  const invalid = () =>
    new Error("Choose a 16-bit mono or stereo PCM WAV file.");
  if (bytes.length < 44 || tag(0) !== 0x52494646 || tag(8) !== 0x57415645)
    throw invalid();
  const size = u32(4) + 8;
  if (size > bytes.length) throw invalid();
  let rate = 0;
  let channels = 0;
  let offset = 0;
  let length = 0;
  for (let cursor = 12; cursor + 8 <= size;) {
    const kind = tag(cursor);
    const count = u32(cursor + 4);
    const begin = cursor + 8;
    if (begin + count > size) throw invalid();
    if (kind === 0x666d7420) {
      if (count < 16 || u16(begin) !== 1 || u16(begin + 14) !== 16)
        throw invalid();
      channels = u16(begin + 2);
      rate = u32(begin + 4);
      if (
        (channels !== 1 && channels !== 2) ||
        rate < 8000 ||
        rate > 96000 ||
        u16(begin + 12) !== channels * 2 ||
        u32(begin + 8) !== rate * channels * 2
      )
        throw invalid();
    } else if (kind === 0x64617461 && !offset) {
      offset = begin;
      length = count;
    }
    cursor = begin + count + (count % 2);
  }
  if (!channels || !length || length % (channels * 2)) throw invalid();
  return { input, offset, rate, channels, frames: length / (channels * 2) };
}
