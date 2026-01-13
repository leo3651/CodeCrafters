import { BlobObj } from "./blob";
import { CommitObj } from "./commit";
import { ObjectType, type Entry } from "./model";
import { TreeObj } from "./tree";

export class GitObjectFile {
  constructor(
    public sha1Hash: Buffer,
    public sha1HexHash: string,
    public fileContent: Buffer,
    public payload: Buffer,
    public type: ObjectType,
    public length: number
  ) {}

  public static create(
    objectContent: Buffer,
    objectType: ObjectType
  ): GitObjectFile {
    let gitObjectFileContent: Buffer = Buffer.alloc(0);
    let gitObjectFileSha1Hash: Buffer = Buffer.alloc(0);

    // Commit object
    if (objectType === ObjectType.OBJ_COMMIT) {
      const { sha1Hash, fileContent }: GitObjectFile =
        CommitObj.create(objectContent);
      gitObjectFileContent = fileContent;
      gitObjectFileSha1Hash = sha1Hash;
    }

    // Tree object
    else if (objectType === ObjectType.OBJ_TREE) {
      const entries: Entry[] = TreeObj.parse(objectContent);
      const { sha1Hash, fileContent }: GitObjectFile = TreeObj.create(entries);
      gitObjectFileContent = fileContent;
      gitObjectFileSha1Hash = sha1Hash;
    }

    // Blob object
    else if (objectType === ObjectType.OBJ_BLOB) {
      const { fileContent, sha1Hash }: GitObjectFile =
        BlobObj.create(objectContent);
      gitObjectFileContent = fileContent;
      gitObjectFileSha1Hash = sha1Hash;
    }

    return new GitObjectFile(
      gitObjectFileSha1Hash,
      gitObjectFileSha1Hash.toString("hex"),
      gitObjectFileContent,
      objectContent,
      objectType,
      objectContent.length
    );
  }
}
