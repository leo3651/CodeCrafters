import { GitObject } from "./gitObject";
import { GitObjectFile } from "./gitObjectFile";
import { createSha1HexHash, getGitObjectType } from "./utils";

export class CommitObj {
  public static write(
    treeSha1Hash: string,
    message: string,
    parentCommit: string
  ): string {
    const content: Buffer = Buffer.concat([
      new Uint8Array(Buffer.from(`tree ${treeSha1Hash}\n`)),
      new Uint8Array(Buffer.from(`parent ${parentCommit}\n`)),
      new Uint8Array(
        Buffer.from(`author <author@gmail.com> ${Date.now()} +0000\n`)
      ),
      new Uint8Array(
        Buffer.from(`commiter <author@gmail.com> ${Date.now()} +0000\n\n`)
      ),
      new Uint8Array(Buffer.from(`${message}\n`)),
    ]);

    const commitGitObject: GitObjectFile = this.create(content);
    GitObject.write(
      commitGitObject.fileContent,
      commitGitObject.sha1Hash.toString("hex")
    );

    return commitGitObject.sha1Hash.toString("hex");
  }

  public static create(commitContent: Buffer): GitObjectFile {
    const commitFile: Buffer = Buffer.concat([
      new Uint8Array(Buffer.from(`commit ${commitContent.length}\0`)),
      new Uint8Array(commitContent),
    ]);

    return new GitObjectFile(
      createSha1HexHash(commitFile),
      createSha1HexHash(commitFile).toString("hex"),
      commitFile,
      commitContent,
      getGitObjectType("commit"),
      commitContent.length
    );
  }
}
