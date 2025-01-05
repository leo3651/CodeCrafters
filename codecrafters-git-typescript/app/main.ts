import { GitHandler } from "./gitHandler";

const gitHandler = new GitHandler();
const args = process.argv.slice(2);
const command = args[0];
const flag = args[1];
const fileName = args[2];
const fileSha1Hash = args[2];

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
    gitHandler.gitInit();
    break;

  // CAT FILE
  case Commands.catFile:
    if (flag === "-p") {
      const decompressedBlobPayload = gitHandler.readBlobObject(fileSha1Hash);
      process.stdout.write(decompressedBlobPayload.toString());
    }
    break;

  // HASH OBJECT
  case Commands.hashObject:
    if (flag === "-w") {
      console.log(gitHandler.writeBlobObject(".", fileName));
    }
    break;

  // LS TREE
  case Commands.lsTree:
    if (flag === "--name-only") {
      const entries = gitHandler.readTreeObject(fileSha1Hash);
      entries?.forEach((entry) => console.log(entry.name));
    }
    break;

  // WRITE TREE
  case Commands.writeTree:
    const treeObjSha1Hash = gitHandler.writeTreeObjectsRecursively(".");
    console.log(treeObjSha1Hash.toString("hex"));
    break;

  // WRITE TREE
  case Commands.commit:
    const treeSha1Hash = args[1];
    const parentCommit = args[3];
    const message = args[5];
    console.log(
      gitHandler.writeCommitObject(treeSha1Hash, message, parentCommit)
    );

    break;

  // CLONE
  case Commands.clone:
    const cloneURL = args[1];
    const dir = args[2];
    gitHandler.clone(cloneURL, dir).then(() => {
      console.log("FINISHED");
    });

    break;

  default:
    throw new Error(`Unknown command ${command}`);
}
