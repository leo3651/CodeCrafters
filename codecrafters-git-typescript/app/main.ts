import * as fs from "fs";
import zlib from "zlib";

const args = process.argv.slice(2);
const command = args[0];

enum Commands {
  Init = "init",
  catFile = "cat-file",
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
    const flag = args[1];
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

  default:
    throw new Error(`Unknown command ${command}`);
}
