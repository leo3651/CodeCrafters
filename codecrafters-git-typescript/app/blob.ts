import fs from "fs";
import { createSha1HexHash, getGitObjectType } from "./utils";
import { GitObject } from "./gitObject";
import { GitObjectFile } from "./gitObjectFile";

export class BlobObj {
  public static read(blobSha1Hash: string, basePath: string = ""): Buffer {
    const { payload }: GitObjectFile = GitObject.read(blobSha1Hash, basePath);
    return payload;
  }

  public static write(path: string, fileName: string): string {
    const fileContent: Buffer = fs.readFileSync(`${path}/${fileName}`);
    const blobGitObject: GitObjectFile = this.create(fileContent);

    GitObject.write(
      blobGitObject.fileContent,
      blobGitObject.sha1Hash.toString("hex")
    );

    return blobGitObject.sha1Hash.toString("hex");
  }

  public static create(blobContent: Buffer): GitObjectFile {
    const blobFile: Buffer = Buffer.concat([
      new Uint8Array(Buffer.from(`blob ${blobContent.length}\0`)),
      new Uint8Array(blobContent),
    ]);

    return new GitObjectFile(
      createSha1HexHash(blobFile),
      createSha1HexHash(blobFile).toString("hex"),
      blobFile,
      blobContent,
      getGitObjectType("blob"),
      blobContent.length
    );
  }
}
