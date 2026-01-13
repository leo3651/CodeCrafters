import { ObjectType, type DecompressedObject } from "./model";
import { getGitObjectType } from "./utils";
import zlib from "node:zlib";
import fs from "fs";
import { DeltaObject } from "./deltaObject";
import { GitObjectFile } from "./gitObjectFile";

export class GitObject {
  public static write(content: Buffer, sha1Hash: string, basePath = ""): void {
    const compressedFile: Uint8Array = new Uint8Array(
      zlib.deflateSync(new Uint8Array(content))
    );

    const dir: string = sha1Hash.slice(0, 2);
    const file: string = sha1Hash.slice(2);

    if (!fs.existsSync(`${basePath}.git/objects/${dir}`)) {
      fs.mkdirSync(`${basePath}.git/objects/${dir}`, { recursive: true });
    }
    fs.writeFileSync(`${basePath}.git/objects/${dir}/${file}`, compressedFile);
  }

  public static read(fileSha1Hash: string, basePath = ""): GitObjectFile {
    const dir: string = fileSha1Hash.slice(0, 2);
    const file: string = fileSha1Hash.slice(2);

    const fileContent: Buffer = fs.readFileSync(
      `${basePath}.git/objects/${dir}/${file}`
    );

    const decompressedFileContent: Buffer = zlib.unzipSync(
      new Uint8Array(fileContent)
    );

    const nullByteIndex: number = decompressedFileContent.indexOf("\0");
    const header: string[] = decompressedFileContent
      .toString()
      .slice(0, nullByteIndex)
      .split(" ");

    const type: ObjectType = getGitObjectType(header[0]);
    const length: number = parseInt(header[1]);
    const payload: Buffer = decompressedFileContent.subarray(nullByteIndex + 1);

    return {
      sha1Hash: Buffer.from(fileSha1Hash, "hex"),
      sha1HexHash: fileSha1Hash,
      fileContent: decompressedFileContent,
      payload,
      type,
      length,
    };
  }

  public static async create(objects: DecompressedObject[]): Promise<{
    gitObjects: GitObjectFile[];
    deltaObjects: DeltaObject[];
  }> {
    const gitObjects: GitObjectFile[] = [];
    const deltaObjects: DeltaObject[] = [];

    objects.forEach((object) => {
      if (object.objectType === ObjectType.OBJ_REF_DELTA) {
        if (!object.deltaRef) {
          throw new Error("Delta object has no reference");
        }
        deltaObjects.push(
          DeltaObject.create(
            object.objectContent,
            object.objectType,
            object.deltaRef
          )
        );
      } else {
        gitObjects.push(
          GitObjectFile.create(object.objectContent, object.objectType)
        );
      }
    });

    return { gitObjects, deltaObjects };
  }
}
