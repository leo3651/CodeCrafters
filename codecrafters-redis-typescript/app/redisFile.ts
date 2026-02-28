import fs from "fs";
import { EOpCode } from "./model";

class RedisFile {
  private redisFileOffset: number = 0;
  public dir = "";
  public dbFileName = "";

  public readonly KEY_VAL_WITHOUT_EXPIRY: { [key: string]: string } = {};
  public readonly KEY_VAL_WITH_EXPIRY: { [key: string]: string } = {};
  public readonly AUX_KEY_VAL_PAIRS: { [key: string]: string } = {};

  private readonly EMPTY_RDB_FILE_HEX: string =
    "524544495330303131fa0972656469732d76657205372e322e30fa0a72656469732d62697473c040fa056374696d65c26d08bc65fa08757365642d6d656dc2b0c41000fa08616f662d62617365c000fff06e3bfec0ff5aa2";

  constructor() {}

  public readIfExists(dir: string, dbFileName: string): void {
    if (dir && dbFileName) {
      this.dir = dir;
      this.dbFileName = dbFileName;

      const path: string = `${dir}/${dbFileName}`;

      try {
        this.redisFileOffset = 0;

        const rdbFileContent: Buffer = fs.readFileSync(path);

        console.log("RDB FILE BUFFER: ", rdbFileContent);
        console.log("RDB FILE STRING: ", rdbFileContent.toString());
        console.log("RDB FILE HEX: ", rdbFileContent.toString("hex"));

        this.parseRedisFile(rdbFileContent);
      } catch (err) {
        console.log(`${err} at path "${path}"`);
      }
    }
  }

  private parseRedisFile(data: Buffer): void {
    const magicStr: string = data.subarray(this.redisFileOffset, 9).toString();
    this.redisFileOffset += 9;

    if (magicStr !== "REDIS0011") {
      throw new Error("Unexpected file format");
    }

    while (true) {
      if (this.redisFileOffset >= data.length - 1) {
        break;
      }

      this.parseOpCode(data);
    }

    console.log("NO EXPIRY", this.KEY_VAL_WITHOUT_EXPIRY);
    console.log("EXPIRY", this.KEY_VAL_WITH_EXPIRY);
    console.log("AUX:", this.AUX_KEY_VAL_PAIRS);
  }

  private parseOpCode(data: Buffer): void {
    switch (data[this.redisFileOffset]) {
      case EOpCode.AUX:
        this.redisFileOffset++;
        const key: Buffer = this.readRedisString(data);

        this.redisFileOffset++;
        const val: Buffer = this.readRedisString(data);

        this.AUX_KEY_VAL_PAIRS[key.toString()] = val.toString();
        break;

      case EOpCode.SELECTDB:
        this.redisFileOffset++;
        break;

      case EOpCode.RESIZE_DB:
        this.redisFileOffset++;
        {
          const totalHashTableSize: number = this.readLength(data);
          this.redisFileOffset++;
          const expiryHashTableSize: number = this.readLength(data);
          this.redisFileOffset++;

          const hashTableSizeWithoutExpiry: number =
            totalHashTableSize - expiryHashTableSize;

          for (let i = 0; i < expiryHashTableSize; i++) {
            this.parseOpCode(data);
          }

          for (let i = 0; i < hashTableSizeWithoutExpiry; i++) {
            const objType: number = data[this.redisFileOffset];
            this.redisFileOffset++;

            const key: Buffer = this.readRedisString(data);
            this.redisFileOffset++;
            const val: Buffer = this.readRedisString(data);

            if (i !== hashTableSizeWithoutExpiry - 1) {
              this.redisFileOffset++;
            }

            this.KEY_VAL_WITHOUT_EXPIRY[key.toString()] = val.toString();
          }
        }

        break;

      case EOpCode.EXPIRE_TIME_SEC:
      case EOpCode.EXPIRE_TIME_MS:
        let expiryDate: number = 0;

        if (data[this.redisFileOffset] === EOpCode.EXPIRE_TIME_SEC) {
          expiryDate =
            data.subarray(this.redisFileOffset).readUInt32LE(1) * 1000;
          this.redisFileOffset += 5;
        } else {
          expiryDate = Number(
            data.subarray(this.redisFileOffset).readBigUInt64LE(1),
          );
          this.redisFileOffset += 9;
        }

        {
          const objType: number = data[this.redisFileOffset];
          this.redisFileOffset++;
          const key: Buffer = this.readRedisString(data);
          this.redisFileOffset++;
          const val: Buffer = this.readRedisString(data);

          this.KEY_VAL_WITH_EXPIRY[key.toString()] = val.toString();
          this.handleExpiry(
            expiryDate,
            this.KEY_VAL_WITH_EXPIRY,
            key.toString(),
          );
        }

        break;

      case EOpCode.EOF:
        this.redisFileOffset += 8;
        break;

      default:
        throw new Error("Unknown opCode");
    }

    this.redisFileOffset++;
  }

  private handleExpiry(
    expireDate: number,
    obj: { [key: string]: string },
    key: string,
  ): void {
    const now: number = Date.now();
    const expireTime: number = expireDate - now;

    if (expireTime <= 0) {
      delete obj[key];
    } else {
      setTimeout(() => {
        delete obj[key];
      }, expireTime);
    }
  }

  private readLength(data: Buffer): number {
    const first: number = data[this.redisFileOffset];
    const flag: number = first >> 6;

    switch (flag) {
      // MSB 00
      case 0:
        return first & 0x3f;

      // MSB 01
      case 1: {
        const val: number =
          ((first & 0x3f) << 6) | data[this.redisFileOffset + 1];
        this.redisFileOffset++;

        return val;
      }

      // MSB 10
      case 2:
        const val: number = data
          .subarray(this.redisFileOffset + 1)
          .readInt32BE();
        this.redisFileOffset += 4;

        return val;

      // MSB 11
      case 3:
        const encType: number = first & 0x3f;
        if (encType === 0) {
          this.redisFileOffset++;
          return data[this.redisFileOffset];
        }

        if (encType === 1) {
          const val: number = data
            .subarray(this.redisFileOffset + 1)
            .readInt16BE(0);
          this.redisFileOffset += 2;
          return val;
        }

        if (encType === 2) {
          const val: number = data
            .subarray(this.redisFileOffset)
            .readInt32BE(0);
          this.redisFileOffset += 4;
          return val;
        }

        throw new Error(`Unsupported special encoding at MSB 11`);

      default:
        throw new Error(`Unsupported special encoding`);
    }
  }

  private readRedisString(data: Buffer): Buffer {
    const startingOffset: number = this.redisFileOffset + 1;
    const first: number = data[this.redisFileOffset];
    const flag: number = first >> 6;

    const value: number = this.readLength(data);

    if (flag === 3) {
      return Buffer.from(value.toString());
    } else {
      this.redisFileOffset += value;
      return data.subarray(startingOffset, startingOffset + value);
    }
  }

  public getEmptyRdbFileBuffer(): Buffer {
    const buf: Buffer = Buffer.from(this.EMPTY_RDB_FILE_HEX, "hex");
    return Buffer.concat([Buffer.from(`$${buf.length}\r\n`), buf]);
  }
}

const redisFile: RedisFile = new RedisFile();
export { redisFile };
