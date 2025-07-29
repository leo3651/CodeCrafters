export class Utils {
  constructor() {}

  public readVariant(
    data: Buffer,
    zigzag: boolean
  ): { value: number; length: number } {
    let value: number = 0;
    let shift: number = 0;
    let offset: number = 0;

    while (true) {
      value |= (0b01111111 & data[offset]) << shift;

      if ((data[offset] & 0b10000000) === 0) {
        break;
      }

      shift += 7;
      offset++;
    }

    offset++;

    return { value: zigzag ? value / 2 : value, length: offset };
  }

  public writeUnsignedVariant(value: number): Buffer {
    const chunks: number[] = [];

    while (true) {
      const byte = value & 0b01111111;
      value >>>= 7;

      if (value === 0) {
        chunks.push(byte);
        break;
      }

      chunks.push(byte | 0b10000000);
    }

    return Buffer.from(chunks);
  }
}

const utils = new Utils();
export { utils };
