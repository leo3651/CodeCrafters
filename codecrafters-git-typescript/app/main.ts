import * as fs from "fs";
import zlib from "zlib";
import crypto from "crypto";

const args = process.argv.slice(2);
const command = args[0];
const flag = args[1];

enum Commands {
  Init = "init",
  catFile = "cat-file",
  hashObject = "hash-object",
}

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

      const blob = fs.readFileSync(`.git/objects/${blobDir}/${blobFile}`);
      const decompressedBlob = zlib.unzipSync(new Uint8Array(blob));
      const nullByteIndex = decompressedBlob.indexOf(0);

      process.stdout.write(
        decompressedBlob.slice(nullByteIndex + 1).toString()
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

  default:
  // throw new Error(`Unknown command ${command}`);
}
