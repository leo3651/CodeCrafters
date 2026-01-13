import type { AxiosResponse } from "axios";
import {
  ObjectType,
  type DecompressedObject,
  type DecompressedZlibContent,
  type ObjectHeader,
} from "./model";
import { REF_SIZE } from "./utils";
import zlib from "node:zlib";
import axios from "axios";

export class PackFile {
  public static async parse(
    packObjBuffer: Buffer,
    i: number
  ): Promise<DecompressedObject> {
    const objHeader: ObjectHeader = this.parseObjectHeader(packObjBuffer, i);
    i += objHeader.parsedBytes;

    // Delta object
    if (ObjectType.OBJ_REF_DELTA === objHeader.objectType) {
      const deltaRef: Buffer = packObjBuffer.subarray(i, i + REF_SIZE);
      const { objectContent, parsedBytes }: DecompressedZlibContent =
        await this.decompressPackFileObject(
          packObjBuffer.subarray(i + REF_SIZE),
          objHeader.objectSize
        );
      return {
        objectContent,
        parsedBytes: parsedBytes + objHeader.parsedBytes + REF_SIZE,
        objectType: objHeader.objectType,
        deltaRef,
      };
    }

    // Non delta objects
    else {
      const { objectContent, parsedBytes }: DecompressedZlibContent =
        await this.decompressPackFileObject(
          packObjBuffer.subarray(i),
          objHeader.objectSize
        );
      return {
        objectContent,
        parsedBytes: parsedBytes + objHeader.parsedBytes,
        objectType: objHeader.objectType,
      };
    }
  }

  private static parseObjectHeader(buffer: Buffer, i: number): ObjectHeader {
    const start: number = i;
    const type: ObjectType = (buffer[i] & 0b01110000) >> 4;
    let size: number = buffer[i] & 0b00001111;
    let offset: number = 4;

    while (buffer[i] & 0x80) {
      i++;
      size += (buffer[i] & 0b01111111) << offset;
      offset += 7;
    }
    i++;

    const objHeader: ObjectHeader = {
      objectSize: size,
      objectType: type,
      parsedBytes: i - start,
    };

    return objHeader;
  }

  private static async decompressPackFileObject(
    compressedData: Buffer,
    objectSize: number
  ): Promise<DecompressedZlibContent> {
    return new Promise((resolve, reject) => {
      const inflater: zlib.Inflate = zlib.createInflate();
      let decompressedData: Buffer = Buffer.alloc(0);

      inflater.write(compressedData);
      inflater.end();

      inflater.on("data", (data) => {
        decompressedData = Buffer.concat([
          new Uint8Array(decompressedData),
          new Uint8Array(data),
        ]);

        if (decompressedData.length > objectSize) {
          throw new Error("Decompressed length exceeded");
        }
      });

      inflater.on("end", () => {
        resolve({
          parsedBytes: inflater.bytesWritten,
          objectContent: decompressedData,
        });
      });

      inflater.on("error", (err) => {
        reject(err);
      });
    });
  }

  public static async getHash(
    cloneURL: string
  ): Promise<{ packHash: string; ref: string }> {
    const response: AxiosResponse = await axios.get(
      cloneURL + "/info/refs?service=git-upload-pack"
    );

    const lines: string[] = response.data.split("\n");
    let packHash: string = "";
    let ref: string = "";

    for (const line of lines) {
      if (line.includes("refs/heads/master")) {
        packHash = line.split(" ")[0].slice(4);
        ref = line.split(" ")[1];
      }
    }

    return { packHash, ref };
  }

  public static async getFromServer(
    cloneURL: string,
    hash: string
  ): Promise<AxiosResponse> {
    const gitUploadEndpoint: string = "/git-upload-pack";
    const hashToSend: Buffer = Buffer.from(
      `0032want ${hash}\n00000009done\n`,
      "utf8"
    );

    const headers: Dict<string> = {
      "Content-Type": "application/x-git-upload-pack-request",
      "accept-encoding": "gzip,deflate",
    };

    return await axios.post(cloneURL + gitUploadEndpoint, hashToSend, {
      headers,
      responseType: "arraybuffer",
    });
  }
}
