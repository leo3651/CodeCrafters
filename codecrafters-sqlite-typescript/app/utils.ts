export function readVariant(buffer: Buffer) {
  const bytes = Buffer.from(buffer);
  let result = 0;
  let i = 0;

  while (i < 8) {
    result <<= 7;
    result |= bytes[i] & 0x7f;

    if (bytes[i] < 0x80) {
      break;
    }
    i++;
  }

  return { result, bytesRead: i + 1 };
}
