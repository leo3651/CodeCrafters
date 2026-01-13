import { readLittleEndianBytes } from "./utils";

export class InstructionParser {
  public static parseSize(
    instructions: Buffer,
    i: number
  ): { parsedBytes: number; size: number } {
    let parsedBytes: number = 1;
    let size: number = instructions[i];
    let offset: number = 7;

    while (instructions[i] & 0x80) {
      i++;
      parsedBytes++;
      size += (instructions[i] & 0b01111111) << offset;
      offset += 7;
    }

    return { parsedBytes, size };
  }

  public static parseInsert(
    instructions: Buffer,
    i: number
  ): { insertContent: Buffer; parsedBytes: number } {
    const size: number = instructions[i];
    i++;
    const parsedBytes: number = size + 1;

    const insertContent: Buffer = instructions.subarray(i, i + size);
    return { insertContent, parsedBytes };
  }

  public static parseCopy(
    instructions: Buffer,
    i: number
  ): { offset: number; size: number; parsedBytes: number } {
    const sizeArr: number[] = [];
    const offsetArr: number[] = [];
    const mask: number = instructions[i];
    i++;
    let parsedBytes: number = 1;

    for (let n = 0; n < 7; n++) {
      // Lower 3 bits
      if (n < 4) {
        if (mask & (1 << n)) {
          offsetArr.push(instructions[i]);
          i++;
          parsedBytes++;
        } else {
          offsetArr.push(0);
        }
      }

      // Higher 4 bits
      else {
        if (mask & (1 << n)) {
          sizeArr.push(instructions[i]);
          i++;
          parsedBytes++;
        } else {
          sizeArr.push(0);
        }
      }
    }

    const size: number = readLittleEndianBytes(sizeArr);
    const offset: number = readLittleEndianBytes(offsetArr);

    return { offset, size, parsedBytes };
  }
}
