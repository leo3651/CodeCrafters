import { GitObject } from "./gitObject";
import { Init } from "./init";
import { PackFile } from "./packFile";
import fs from "fs";
import { TreeObj } from "./tree";
import type { DecompressedObject, Entry } from "./model";
import { DeltaObject } from "./deltaObject";
import { GitObjectFile } from "./gitObjectFile";
import type { AxiosResponse } from "axios";

export class Clone {
  public static async execute(cloneURL: string, dir: string) {
    const {
      packHash,
      ref,
    }: {
      packHash: string;
      ref: string;
    } = await PackFile.getHash(cloneURL);
    const res: AxiosResponse<any, any> = await PackFile.getFromServer(
      cloneURL,
      packHash
    );
    const {
      objects,
    }: {
      objects: DecompressedObject[];
    } = await this.getRawGitObjectsContent(res.data);

    const {
      gitObjects,
      deltaObjects,
    }: { gitObjects: GitObjectFile[]; deltaObjects: DeltaObject[] } =
      await GitObject.create(objects);

    fs.mkdirSync(dir);
    Init.execute(`${dir}/`);

    fs.writeFileSync(`${dir}/.git/HEAD`, `ref: ${ref}`);
    fs.mkdirSync(`${dir}/.git/refs/heads`, { recursive: true });
    fs.writeFileSync(`${dir}/.git/refs/heads/${ref.split("/")[2]}`, packHash);

    for (const gitObj of gitObjects) {
      GitObject.write(
        gitObj.fileContent,
        gitObj.sha1Hash.toString("hex"),
        `${dir}/`
      );
    }

    this.resolveDeltaObjects(deltaObjects, `${dir}/`);
    const treeToCheckout: string = TreeObj.findTreeToCheckout(
      packHash,
      `${dir}/`
    );
    this.writeFilesAndFolders(treeToCheckout, `${dir}/`, `${dir}/`);
  }

  private static async getRawGitObjectsContent(
    responseData: Buffer
  ): Promise<{ objects: DecompressedObject[]; checksumHash: Buffer }> {
    const packData: Buffer = responseData.subarray(4);
    const packObjCount: number = packData.readUInt32BE(12);
    const packObjects: Buffer = packData.subarray(16);
    let i = 0;
    const objects: DecompressedObject[] = [];

    for (let count = 0; count < packObjCount; count++) {
      const obj: DecompressedObject = await PackFile.parse(packObjects, i);
      i += obj.parsedBytes;

      objects.push(obj);
    }

    const checksumHash: Buffer = responseData.slice(responseData.length - 20);
    i += 20;

    return { objects, checksumHash };
  }

  private static resolveDeltaObjects(
    deltaObjects: DeltaObject[],
    basePath: string
  ): void {
    const pendingDeltaObjects: DeltaObject[] = [];

    for (const deltaObj of deltaObjects) {
      try {
        const referencedGitObject: GitObjectFile = GitObject.read(
          deltaObj.ref.toString("hex"),
          basePath
        );
        const appliedDeltaContent: Buffer = DeltaObject.applyDeltaInstructions(
          deltaObj.instructions,
          referencedGitObject.payload
        );
        const resolvedDeltaObject: GitObjectFile = GitObjectFile.create(
          appliedDeltaContent,
          referencedGitObject.type
        );
        GitObject.write(
          resolvedDeltaObject.fileContent,
          resolvedDeltaObject.sha1Hash.toString("hex"),
          basePath
        );
      } catch (err) {
        pendingDeltaObjects.push(deltaObj);
      }
    }

    if (pendingDeltaObjects.length) {
      this.resolveDeltaObjects(pendingDeltaObjects, basePath);
    }
  }

  private static writeFilesAndFolders(
    treeSha1Hash: string,
    path: string,
    gitDir: string
  ): void {
    const treeGitObject: GitObjectFile = GitObject.read(treeSha1Hash, gitDir);
    const entries: Entry[] = TreeObj.parse(treeGitObject.payload);

    for (const entry of entries) {
      // Write blob
      if (entry.mode === "100644") {
        const blobGitObject: GitObjectFile = GitObject.read(
          entry.sha1HexHash,
          gitDir
        );
        fs.writeFileSync(
          `${path}${entry.name}`,
          new Uint8Array(blobGitObject.payload)
        );
      }

      // Write directory
      else if (entry.mode === "40000") {
        fs.mkdirSync(`${path}${entry.name}`);

        this.writeFilesAndFolders(
          entry.sha1HexHash,
          `${path}${entry.name}/`,
          gitDir
        );
      }
    }
  }
}
