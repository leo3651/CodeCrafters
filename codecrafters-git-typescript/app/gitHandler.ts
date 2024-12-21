import zlib from "zlib";
import fs from "fs";
import crypto from "crypto";
import type { Entry } from "./model";

export class GitHandler {
  constructor() {}

  gitInit(): void {
    fs.mkdirSync(".git", { recursive: true });
    fs.mkdirSync(".git/objects", { recursive: true });
    fs.mkdirSync(".git/refs", { recursive: true });
    fs.writeFileSync(".git/HEAD", "ref: refs/heads/main\n");
    console.log("Initialized git directory");
  }

  readBlob(blobSha1Hash: string): Buffer {
    const blobDir = blobSha1Hash.slice(0, 2);
    const blobFile = blobSha1Hash.slice(2);

    const blobContent = fs.readFileSync(`.git/objects/${blobDir}/${blobFile}`);
    const decompressedBlobContent = zlib.unzipSync(new Uint8Array(blobContent));
    const nullByteIndex = decompressedBlobContent.indexOf(0);

    return decompressedBlobContent.slice(nullByteIndex + 1);
  }

  createBlob(path: string, fileName: string): string {
    const fileContent = new Uint8Array(fs.readFileSync(`${path}/${fileName}`));

    const blobContent = new Uint8Array(
      Buffer.concat([
        new Uint8Array(Buffer.from(`blob ${fileContent.length}\0`)),
        fileContent,
      ])
    );

    const blobSha1Hash = this.createSha1HexHash(blobContent);
    this.writeObject(blobContent, blobSha1Hash);

    return blobSha1Hash;
  }

  readTree(treeSha1Hash: string): Entry[] {
    const treeDir = treeSha1Hash.slice(0, 2);
    const treeFile = treeSha1Hash.slice(2);

    const treeContent = fs.readFileSync(`.git/objects/${treeDir}/${treeFile}`);
    const decompressedTreeContent = zlib.unzipSync(new Uint8Array(treeContent));

    return this.parseTreeEntries(
      decompressedTreeContent.slice(decompressedTreeContent.indexOf(0) + 1)
    );
  }

  parseTreeEntries(buf: Buffer): Entry[] {
    const entries: Entry[] = [];

    if (!buf.length) {
      return entries;
    }

    const spaceCharIndex = buf.indexOf(32);
    const nullByteIndex = buf.indexOf(0);

    const mode = buf.slice(0, spaceCharIndex).toString();
    const name = buf.slice(spaceCharIndex + 1, nullByteIndex).toString();
    const sha1Hash = buf.slice(nullByteIndex + 1, nullByteIndex + 1 + 20);

    entries.push({
      name,
      mode,
      sha1Hash,
    } as Entry);

    const nextOffset = mode.length + 1 + name.length + 1 + sha1Hash.length + 1;

    const nextEntry = this.parseTreeEntries(buf.slice(nextOffset));
    if (nextEntry.length) {
      entries.push(...nextEntry);
    }

    return entries;
  }

  createTreeObjectsRecursively(path: string): Buffer {
    const entries: Entry[] = [];

    fs.readdirSync(path, { withFileTypes: true }).forEach((file) => {
      if (file.name === ".git") {
        return;
      }

      if (file.isFile()) {
        const blobSha1Hash = this.createBlob(path, file.name);
        entries.push({
          name: file.name,
          mode:
            fs.statSync(`${path}/${file.name}`).mode & 0o111
              ? "100755"
              : "100644",
          sha1Hash: Buffer.from(blobSha1Hash, "hex"),
        });
      }

      if (file.isDirectory()) {
        const treeSha1Hash = this.createTreeObjectsRecursively(
          `${path}/${file.name}`
        );
        entries.push({
          name: file.name,
          mode: "40000",
          sha1Hash: treeSha1Hash,
        });
      }
    });

    return this.createTreeObject(entries);
  }

  createTreeObject(entries: Entry[]): Buffer {
    let content = Buffer.alloc(0);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    entries.forEach((entry) => {
      content = Buffer.concat([
        new Uint8Array(content),
        new Uint8Array(Buffer.from(`${entry.mode} ${entry.name}\0`)),
        new Uint8Array(entry.sha1Hash),
      ]);
    });

    const treeContent = new Uint8Array(
      Buffer.concat([
        new Uint8Array(Buffer.from(`tree ${content.length}\0`)),
        new Uint8Array(content),
      ])
    );
    const treeSha1Hash = this.createSha1HexHash(treeContent);
    this.writeObject(treeContent, treeSha1Hash);

    return Buffer.from(treeSha1Hash, "hex");
  }

  createCommitObject(
    treeSha1Hash: string,
    message: string,
    parentCommit: string
  ): string {
    const content = Buffer.concat([
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

    const commitContent = new Uint8Array(
      Buffer.concat([
        new Uint8Array(Buffer.from(`commit ${content.length}\0`)),
        new Uint8Array(content),
      ])
    );

    const commitSha1Hash = this.createSha1HexHash(commitContent);
    this.writeObject(commitContent, commitSha1Hash);

    return commitSha1Hash;
  }

  writeObject(content: Uint8Array, sha1Hash: string): void {
    const compressedFile = new Uint8Array(zlib.deflateSync(content));

    const dir = sha1Hash.slice(0, 2);
    const file = sha1Hash.slice(2);

    fs.mkdirSync(`.git/objects/${dir}`, { recursive: true });
    fs.writeFileSync(`.git/objects/${dir}/${file}`, compressedFile);
  }

  createSha1HexHash(content: Uint8Array): string {
    return crypto.createHash("sha1").update(content).digest("hex");
  }
}
