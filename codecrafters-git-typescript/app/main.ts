import * as fs from "fs";
import zlib from "zlib";
import crypto from "crypto";
import type { Entry } from "./model";

const args = process.argv.slice(2);
const command = args[0];
const flag = args[1];

enum Commands {
  Init = "init",
  catFile = "cat-file",
  hashObject = "hash-object",
  lsTree = "ls-tree",
}
const entries: Entry[] = [];

switch (command) {
  // INIT
  case Commands.Init:
    fs.mkdirSync(".git", { recursive: true });
    fs.mkdirSync(".git/objects", { recursive: true });
    fs.mkdirSync(".git/refs", { recursive: true });
    fs.writeFileSync(".git/HEAD", "ref: refs/heads/main\n");
    console.log("Initialized git directory");
    break;

  // CAT FILE
  case Commands.catFile:
    const shaHash = args[2];

    if (flag === "-p") {
      const blobDir = shaHash.slice(0, 2);
      const blobFile = shaHash.slice(2);

      const blobContent = fs.readFileSync(
        `.git/objects/${blobDir}/${blobFile}`
      );
      const decompressedBlobContent = zlib.unzipSync(
        new Uint8Array(blobContent)
      );
      const nullByteIndex = decompressedBlobContent.indexOf(0);

      process.stdout.write(
        decompressedBlobContent.slice(nullByteIndex + 1).toString()
      );
    }
    break;

  // HASH OBJECT
  case Commands.hashObject:
    const fileName = args[2];

    if (flag === "-w") {
      const fileContent = new Uint8Array(fs.readFileSync("./" + fileName));
      const type = new Uint8Array(Buffer.from("blob "));
      const length = new Uint8Array(
        Buffer.from(fileContent.length.toString(), "binary")
      );
      const blob = new Uint8Array(
        Buffer.concat([
          type,
          length,
          new Uint8Array(Buffer.from([0])),
          fileContent,
        ])
      );

      const compressedBlob = new Uint8Array(zlib.deflateSync(blob));
      const blobSha1Hash = crypto.createHash("sha1").update(blob).digest("hex");

      console.log(blobSha1Hash);

      const blobDir = blobSha1Hash.slice(0, 2);
      const blobFile = blobSha1Hash.slice(2);

      fs.mkdirSync(`.git/objects/${blobDir}`);
      fs.writeFileSync(`.git/objects/${blobDir}/${blobFile}`, compressedBlob);
    }

    break;

  // LS TREE
  case Commands.lsTree:
    if (flag === "--name-only") {
      const treeSha1Hash = args[2];

      const treeDir = treeSha1Hash.slice(0, 2);
      const treeFile = treeSha1Hash.slice(2);

      const treeContent = fs.readFileSync(
        `.git/objects/${treeDir}/${treeFile}`
      );

      const decompressedTreeContent = zlib.unzipSync(
        new Uint8Array(treeContent)
      );

      parseTreeEntries(
        decompressedTreeContent.slice(decompressedTreeContent.indexOf(0) + 1)
      );
      entries.forEach((entry) => console.log(entry.name));
    }
    break;

  default:
    throw new Error(`Unknown command ${command}`);
}

function parseTreeEntries(buf: Buffer) {
  if (!buf.length) {
    return;
  }

  const spaceCharIndex = buf.indexOf(32);
  const nullByteIndex = buf.indexOf(0);

  const mode = buf.slice(0, spaceCharIndex).toString();
  const name = buf.slice(spaceCharIndex + 1, nullByteIndex).toString();
  const sha1Hash = buf.slice(nullByteIndex + 1, nullByteIndex + 1 + 20);

  const entry: Entry = {
    name,
    mode,
    sha1Hash,
  };
  entries.push(entry);
  const nextOffset = mode.length + 1 + name.length + 1 + sha1Hash.length + 1;

  parseTreeEntries(buf.slice(nextOffset));
}
