import { BlobObj } from "./blob";
import { GitObject } from "./gitObject";
import { GitObjectFile } from "./gitObjectFile";
import { ObjectType, type Entry } from "./model";
import { createSha1HexHash, getGitObjectType } from "./utils";
import fs from "fs";

export class TreeObj {
  public static read(treeSha1Hash: string, basePath: string = ""): Entry[] {
    const { payload }: { payload: Buffer } = GitObject.read(
      treeSha1Hash,
      basePath
    );
    return this.parse(payload);
  }

  public static parse(entries: Buffer): Entry[] {
    const parsedEntries: Entry[] = [];

    while (entries.length) {
      const spaceCharIndex: number = entries.indexOf(32);
      const nullByteIndex: number = entries.indexOf(0);

      const mode: string = entries.subarray(0, spaceCharIndex).toString();
      const name: string = entries
        .subarray(spaceCharIndex + 1, nullByteIndex)
        .toString();
      const sha1Hash: Buffer = entries.subarray(
        nullByteIndex + 1,
        nullByteIndex + 1 + 20
      );
      const sha1HexHash: string = sha1Hash.toString("hex");

      parsedEntries.push({
        name,
        mode,
        sha1Hash,
        sha1HexHash,
      } as Entry);

      const nextOffset: number =
        mode.length + name.length + 1 + sha1Hash.length + 1;
      entries = entries.subarray(nextOffset);
    }

    return parsedEntries;
  }

  public static writeRecursively(path: string): Buffer {
    const entries: Entry[] = [];

    fs.readdirSync(path, { withFileTypes: true }).forEach((file) => {
      if (file.name === ".git") {
        return;
      }

      if (file.isFile()) {
        const blobSha1Hash: string = BlobObj.write(path, file.name);
        entries.push({
          name: file.name,
          mode:
            fs.statSync(`${path}/${file.name}`).mode & 0o111
              ? "100755"
              : "100644",
          sha1Hash: Buffer.from(blobSha1Hash, "hex"),
          sha1HexHash: blobSha1Hash,
        });
      }

      if (file.isDirectory()) {
        const treeSha1Hash: Buffer = this.writeRecursively(
          `${path}/${file.name}`
        );
        entries.push({
          name: file.name,
          mode: "40000",
          sha1Hash: treeSha1Hash,
          sha1HexHash: treeSha1Hash.toString("hex"),
        });
      }
    });

    return this.write(entries);
  }

  private static write(entries: Entry[]): Buffer {
    const treeGitObject: GitObjectFile = this.create(entries);
    GitObject.write(
      treeGitObject.fileContent,
      treeGitObject.sha1Hash.toString("hex")
    );

    return treeGitObject.sha1Hash;
  }

  public static create(entries: Entry[]): GitObjectFile {
    let content: Buffer = Buffer.alloc(0);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    entries.forEach((entry) => {
      content = Buffer.concat([
        new Uint8Array(content),
        new Uint8Array(Buffer.from(`${entry.mode} ${entry.name}\0`)),
        new Uint8Array(entry.sha1Hash),
      ]);
    });

    const treeFile: Buffer = Buffer.concat([
      new Uint8Array(Buffer.from(`tree ${content.length}\0`)),
      new Uint8Array(content),
    ]);

    return new GitObjectFile(
      createSha1HexHash(treeFile),
      createSha1HexHash(treeFile).toString("hex"),
      treeFile,
      content,
      getGitObjectType("tree"),
      content.length
    );
  }

  public static findTreeToCheckout(sha1Hash: string, basePath: string): string {
    const commitGitObject: GitObjectFile = GitObject.read(sha1Hash, basePath);
    if (commitGitObject.type !== ObjectType.OBJ_COMMIT) {
      throw new Error("Not commit object");
    }

    const treeToCheckout: string = commitGitObject.payload
      .toString("utf-8")
      .split("\n")[0]
      .split(" ")[1];

    return treeToCheckout;
  }
}
