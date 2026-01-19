import { BlobObj } from "./blob";
import { Clone } from "./clone";
import { CommitObj } from "./commit";
import { Init } from "./init";
import type { Entry } from "./model";
import { TreeObj } from "./tree";

const args: string[] = process.argv.slice(2);
const command: string = args[0];
const flag: string = args[1];
const fileName: string = args[2];
const fileSha1Hash: string = args[2];

enum Commands {
  Init = "init",
  catFile = "cat-file",
  hashObject = "hash-object",
  lsTree = "ls-tree",
  writeTree = "write-tree",
  commit = "commit-tree",
  clone = "clone",
}

switch (command) {
  // INIT
  case Commands.Init:
    Init.execute();
    break;

  // CAT FILE
  case Commands.catFile:
    if (flag === "-p") {
      const decompressedBlobPayload: Buffer = BlobObj.read(fileSha1Hash);
      process.stdout.write(decompressedBlobPayload.toString());
    }
    break;

  // HASH OBJECT
  case Commands.hashObject:
    if (flag === "-w") {
      console.log(BlobObj.write(".", fileName));
    }
    break;

  // LS TREE
  case Commands.lsTree:
    if (flag === "--name-only") {
      const entries: Entry[] = TreeObj.read(fileSha1Hash);
      entries?.forEach((entry) => console.log(entry.name));
    }
    break;

  // WRITE TREE
  case Commands.writeTree:
    const treeObjSha1Hash: Buffer = TreeObj.writeRecursively(".");
    console.log(treeObjSha1Hash.toString("hex"));
    break;

  // COMMIT
  case Commands.commit:
    const treeSha1Hash: string = args[1];
    const parentCommit: string = args[3];
    const message: string = args[5];
    console.log(CommitObj.write(treeSha1Hash, message, parentCommit));

    break;

  // CLONE
  case Commands.clone:
    const cloneURL: string = args[1];
    const dir: string = args[2];
    Clone.execute(cloneURL, dir);

    break;

  default:
    throw new Error(`Unknown command ${command}`);
}
