import fs from "fs";
import { EOpCode } from "./model";

class RdbFileParser {
  public dir: string = "";
  public dbFileName: string = "";

  private parseRdbFileOffset: number = 0;

  public readonly KEY_VAL_WITHOUT_EXPIRY: { [key: string]: string } = {};
  public readonly KEY_VAL_WITH_EXPIRY: { [key: string]: string } = {};
  public readonly AUX_KEY_VAL_PAIRS: { [key: string]: string } = {};

  public readonly EMPTY_RDB_FILE_HEX: string =
    "524544495330303131fa0972656469732d76657205372e322e30fa0a72656469732d62697473c040fa056374696d65c26d08bc65fa08757365642d6d656dc2b0c41000fa08616f662d62617365c000fff06e3bfec0ff5aa2";

  constructor() {}

  public readRdbFileIfExists(): void {
    if (this.dir && this.dbFileName) {
      const path = `${this.dir}/${this.dbFileName}`;

      try {
        this.parseRdbFileOffset = 0;

        const rdbFileContent = fs.readFileSync(path);

        console.log("RDB FILE BUFFER: ", rdbFileContent);
        console.log("RDB FILE STRING: ", rdbFileContent.toString());
        console.log("RDB FILE HEX: ", rdbFileContent.toString("hex"));

        this.parseRdbFile(rdbFileContent);
      } catch (err) {
        console.log(`${err} at path "${path}"`);
      }
    }
  }

  private parseRdbFile(data: Buffer): void {
    const magicStr = data.slice(this.parseRdbFileOffset, 9).toString();
    this.parseRdbFileOffset += 9;

    if (magicStr !== "REDIS0011") {
      throw new Error("Unexpected file format");
    }

    while (true) {
      if (this.parseRdbFileOffset >= data.length - 1) {
        break;
      }

      this.parseOpCode(data);
    }

    console.log("NO EXPIRY", this.KEY_VAL_WITHOUT_EXPIRY);
    console.log("EXPIRY", this.KEY_VAL_WITH_EXPIRY);
    console.log("AUX:", this.AUX_KEY_VAL_PAIRS);
  }

  private parseOpCode(data: Buffer): void {
    switch (data[this.parseRdbFileOffset]) {
      case EOpCode.AUX:
        this.parseRdbFileOffset++;
        const key = this.readRedisString(data);
        this.parseRdbFileOffset++;
        const val = this.readRedisString(data);

        this.AUX_KEY_VAL_PAIRS[key.toString()] = val.toString();
        break;

      case EOpCode.SELECTDB:
        this.parseRdbFileOffset++;
        break;

      case EOpCode.RESIZE_DB:
        this.parseRdbFileOffset++;
        {
          const totalHashTableSize = this.readLength(data);
          this.parseRdbFileOffset++;
          const expiryHashTableSize = this.readLength(data);
          this.parseRdbFileOffset++;

          const hashTableSizeWithoutExpiry =
            totalHashTableSize - expiryHashTableSize;

          for (let i = 0; i < expiryHashTableSize; i++) {
            this.parseOpCode(data);
          }

          for (let i = 0; i < hashTableSizeWithoutExpiry; i++) {
            const objType = data[this.parseRdbFileOffset];
            this.parseRdbFileOffset++;

            const key = this.readRedisString(data);
            this.parseRdbFileOffset++;
            const val = this.readRedisString(data);

            if (i !== hashTableSizeWithoutExpiry - 1) {
              this.parseRdbFileOffset++;
            }

            this.KEY_VAL_WITHOUT_EXPIRY[key.toString()] = val.toString();
          }
        }

        break;

      case EOpCode.EXPIRE_TIME_SEC:
      case EOpCode.EXPIRE_TIME_MS:
        let expiryDate: number = 0;

        if (data[this.parseRdbFileOffset] === EOpCode.EXPIRE_TIME_SEC) {
          expiryDate =
            data.slice(this.parseRdbFileOffset).readUInt32LE(1) * 1000;
          this.parseRdbFileOffset += 5;
        } else {
          expiryDate = Number(
            data.slice(this.parseRdbFileOffset).readBigUInt64LE(1)
          );
          this.parseRdbFileOffset += 9;
        }

        {
          const objType = data[this.parseRdbFileOffset];
          this.parseRdbFileOffset++;
          const key = this.readRedisString(data);
          this.parseRdbFileOffset++;
          const val = this.readRedisString(data);

          this.KEY_VAL_WITH_EXPIRY[key.toString()] = val.toString();
          this.handleExpiry(
            expiryDate,
            this.KEY_VAL_WITH_EXPIRY,
            key.toString()
          );
        }

        break;

      case EOpCode.EOF:
        this.parseRdbFileOffset += 8;
        break;

      default:
        throw new Error("Unknown opCode");
    }

    this.parseRdbFileOffset++;
  }

  private handleExpiry(
    expireDate: number,
    obj: { [key: string]: string },
    key: string
  ): void {
    const now = Date.now();
    const expireTime = expireDate - now;

    if (expireTime <= 0) {
      delete obj[key];
    } else {
      setTimeout(() => {
        delete obj[key];
      }, expireTime);
    }
  }

  private readLength(data: Buffer): number {
    const first = data[this.parseRdbFileOffset];
    const flag = first >> 6;

    switch (flag) {
      case 0: // MSB 00
        return first & 0x3f;

      case 1: {
        // MSB 01
        const val = ((first & 0x3f) << 6) | data[this.parseRdbFileOffset + 1];
        this.parseRdbFileOffset++;

        return val;
      }

      case 2: // MSB 10
        const val = data.slice(this.parseRdbFileOffset + 1).readInt32BE();
        this.parseRdbFileOffset += 4;

        return val;

      case 3: // MSB 11
        const encType = first & 0x3f;
        if (encType === 0) {
          this.parseRdbFileOffset++;
          return data[this.parseRdbFileOffset];
        }

        if (encType === 1) {
          const val = data.slice(this.parseRdbFileOffset + 1).readInt16BE(0);
          this.parseRdbFileOffset += 2;
          return val;
        }

        if (encType === 2) {
          const val = data.slice(this.parseRdbFileOffset).readInt32BE(0);
          this.parseRdbFileOffset += 4;
          return val;
        }

        throw new Error(`Unsupported special encoding at MSB 11`);

      default:
        throw new Error(`Unsupported special encoding`);
    }
  }

  private readRedisString(data: Buffer): Buffer {
    const startingOffset = this.parseRdbFileOffset + 1;
    const first = data[this.parseRdbFileOffset];
    const flag = first >> 6;

    const value = this.readLength(data);

    if (flag === 3) {
      return Buffer.from(value.toString());
    } else {
      this.parseRdbFileOffset += value;
      return data.slice(startingOffset, startingOffset + value);
    }
  }
}

const rdbFileParser = new RdbFileParser();
export { rdbFileParser };
