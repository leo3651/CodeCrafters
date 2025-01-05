import zlib from "node:zlib";
import fs from "fs";
import crypto from "crypto";
import {
  ObjectType,
  type Entry,
  type ObjectHeader,
  type DecompressedZlibContent,
  type DecompressedObject,
  type gitObjectFile,
} from "./model";
import axios, { type AxiosResponse } from "axios";

const REF_SIZE = 20;

export class GitHandler {
  constructor() {}

  gitInit(): void {
    fs.mkdirSync(".git", { recursive: true });
    fs.mkdirSync(".git/objects", { recursive: true });
    fs.mkdirSync(".git/refs", { recursive: true });
    fs.writeFileSync(".git/HEAD", "ref: refs/heads/main\n");
    console.log("Initialized git directory");
  }

  readBlobObject(blobSha1Hash: string): Buffer {
    const blobDir = blobSha1Hash.slice(0, 2);
    const blobFile = blobSha1Hash.slice(2);

    const blobContent = fs.readFileSync(`.git/objects/${blobDir}/${blobFile}`);
    const decompressedBlobContent = zlib.unzipSync(new Uint8Array(blobContent));
    const nullByteIndex = decompressedBlobContent.indexOf(0);

    return decompressedBlobContent.slice(nullByteIndex + 1);
  }

  createBlobObject(blobContent: Buffer): gitObjectFile {
    const blobFile = Buffer.concat([
      new Uint8Array(Buffer.from(`blob ${blobContent.length}\0`)),
      new Uint8Array(blobContent),
    ]);

    return {
      fileContent: blobFile,
      sha1Hash: this.createSha1HexHash(blobFile),
    };
  }

  writeBlobObject(path: string, fileName: string): string {
    const fileContent = fs.readFileSync(`${path}/${fileName}`);
    const blobGitObject = this.createBlobObject(fileContent);

    this.writeObject(
      blobGitObject.fileContent,
      blobGitObject.sha1Hash.toString("hex")
    );

    return blobGitObject.sha1Hash.toString("hex");
  }

  readTreeObject(treeSha1Hash: string): Entry[] {
    const treeDir = treeSha1Hash.slice(0, 2);
    const treeFile = treeSha1Hash.slice(2);

    const treeContent = fs.readFileSync(`.git/objects/${treeDir}/${treeFile}`);
    const decompressedTreeContent = zlib.unzipSync(new Uint8Array(treeContent));

    return this.parseTreeObjectEntries(decompressedTreeContent);
  }

  parseTreeObjectEntries(buf: Buffer): Entry[] {
    const parsedEntries: Entry[] = [];

    let entries = buf;
    if (buf.toString().includes("tree ")) {
      const treeLen = Number.parseInt(
        buf.toString().split("tree ")[1].split("\0")[0]
      );
      entries = buf.slice(buf.indexOf(0) + 1);
    }

    while (entries.length) {
      const spaceCharIndex = entries.indexOf(32);
      const nullByteIndex = entries.indexOf(0);

      const mode = entries.slice(0, spaceCharIndex).toString();
      const name = entries.slice(spaceCharIndex + 1, nullByteIndex).toString();
      const sha1Hash = entries.slice(nullByteIndex + 1, nullByteIndex + 1 + 20);

      parsedEntries.push({
        name,
        mode,
        sha1Hash,
      } as Entry);

      const nextOffset =
        mode.length + 1 + name.length + 1 + sha1Hash.length + 1;
      entries = entries.slice(nextOffset);
    }

    return parsedEntries;
  }

  writeTreeObjectsRecursively(path: string): Buffer {
    const entries: Entry[] = [];

    fs.readdirSync(path, { withFileTypes: true }).forEach((file) => {
      if (file.name === ".git") {
        return;
      }

      if (file.isFile()) {
        const blobSha1Hash = this.writeBlobObject(path, file.name);
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
        const treeSha1Hash = this.writeTreeObjectsRecursively(
          `${path}/${file.name}`
        );
        entries.push({
          name: file.name,
          mode: "40000",
          sha1Hash: treeSha1Hash,
        });
      }
    });

    return this.writeTreeObject(entries);
  }

  writeTreeObject(entries: Entry[]): Buffer {
    const treeGitObject = this.createTreeObject(entries);
    this.writeObject(
      treeGitObject.fileContent,
      treeGitObject.sha1Hash.toString("hex")
    );

    return treeGitObject.sha1Hash;
  }

  createTreeObject(entries: Entry[]): gitObjectFile {
    let content = Buffer.alloc(0);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    entries.forEach((entry) => {
      content = Buffer.concat([
        new Uint8Array(content),
        new Uint8Array(Buffer.from(`${entry.mode} ${entry.name}\0`)),
        new Uint8Array(entry.sha1Hash),
      ]);
    });

    const treeFile = Buffer.concat([
      new Uint8Array(Buffer.from(`tree ${content.length}\0`)),
      new Uint8Array(content),
    ]);

    return {
      fileContent: treeFile,
      sha1Hash: this.createSha1HexHash(treeFile),
    };
  }

  writeCommitObject(
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

    const commitGitObject = this.createCommitObject(content);
    this.writeObject(
      commitGitObject.fileContent,
      commitGitObject.sha1Hash.toString("hex")
    );

    return commitGitObject.sha1Hash.toString("hex");
  }

  createCommitObject(commitContent: Buffer): gitObjectFile {
    const commitFile = Buffer.concat([
      new Uint8Array(Buffer.from(`commit ${commitContent.length}\0`)),
      new Uint8Array(commitContent),
    ]);

    return {
      fileContent: commitFile,
      sha1Hash: this.createSha1HexHash(commitFile),
    };
  }

  writeObject(content: Buffer, sha1Hash: string): void {
    const compressedFile = new Uint8Array(
      zlib.deflateSync(new Uint8Array(content))
    );

    const dir = sha1Hash.slice(0, 2);
    const file = sha1Hash.slice(2);

    fs.mkdirSync(`.git/objects/${dir}`, { recursive: true });
    fs.writeFileSync(`.git/objects/${dir}/${file}`, compressedFile);
  }

  createSha1HexHash(content: Buffer): Buffer {
    return crypto.createHash("sha1").update(new Uint8Array(content)).digest();
  }

  async clone(cloneURL: string, dir: string) {
    // HANDLE REQUESTS
    const { packHash, ref } = await this.getPackFileHash(cloneURL);
    const res = await this.getPackFileFromServer(cloneURL, packHash);
    const { objects, checksumHash } = await this.getRawGitObjects(res.data);
    console.log("reference:", ref);
    console.log("checksum hash:", checksumHash);

    //UNPACK
  }

  async fun() {}

  async getRawGitObjects(
    data: Buffer
  ): Promise<{ objects: DecompressedObject[]; checksumHash: Buffer }> {
    const packData: Buffer = data.slice(4);
    const packObjCount = packData.readUInt32BE(12);
    const packObjects = packData.slice(16);
    let i = 0;
    const objects: DecompressedObject[] = [];

    for (let count = 0; count < packObjCount; count++) {
      const obj = await this.parsePackFile(packObjects, i);
      console.log("PARSED OBJECT\n", obj);
      console.log("OBJECT CONTENT:");
      console.log(obj.objectContent.toString("binary"));
      console.log("FINISH\n\n\n\n\n\n");
      i += obj.parsedBytes;

      objects.push(obj);
    }

    const checksumHash = data.slice(data.length - 20);
    i += 20;

    return { objects, checksumHash };
  }

  async getPackFileHash(
    cloneURL: string
  ): Promise<{ packHash: string; ref: string }> {
    const response = await axios.get(
      cloneURL + "/info/refs?service=git-upload-pack"
    );

    const lines = response.data.split("\n");
    let packHash = "";
    let ref = "";

    for (const line of lines) {
      if (line.includes("refs/heads/master")) {
        packHash = line.split(" ")[0].slice(4);
        ref = line.split(" ")[1];
      }
    }

    return { packHash, ref };
  }

  async getPackFileFromServer(
    cloneURL: string,
    hash: string
  ): Promise<AxiosResponse> {
    const gitUploadEndpoint = "/git-upload-pack";
    const hashToSend = Buffer.from(`0032want ${hash}\n00000009done\n`, "utf8");

    const headers = {
      "Content-Type": "application/x-git-upload-pack-request",
      "accept-encoding": "gzip,deflate",
    };

    return await axios.post(cloneURL + gitUploadEndpoint, hashToSend, {
      headers,
      responseType: "arraybuffer",
    });
  }

  async parsePackFile(buffer: Buffer, i: number): Promise<DecompressedObject> {
    const objHeader = this.parsePackFileObjectHeader(buffer, i);
    i += objHeader.parsedBytes;
    console.log("OBJ HEADER\n", objHeader);

    if (
      ObjectType.OBJ_REF_DELTA === objHeader.objectType ||
      ObjectType.OBJ_OFS_DELTA === objHeader.objectType
    ) {
      const ref = buffer.slice(i, i + REF_SIZE);
      const { objectContent: content, parsedBytes } =
        await this.decompressPackFileObject(
          buffer.slice(i + REF_SIZE),
          objHeader.objectSize
        );
      return {
        objectContent: content,
        parsedBytes: parsedBytes + objHeader.parsedBytes + REF_SIZE,
        objectType: objHeader.objectType,
        ref,
      };
    } else {
      const { objectContent: content, parsedBytes } =
        await this.decompressPackFileObject(
          buffer.slice(i),
          objHeader.objectSize
        );
      return {
        objectContent: content,
        parsedBytes: parsedBytes + objHeader.parsedBytes,
        objectType: objHeader.objectType,
      };
    }
  }

  parsePackFileObjectHeader(buffer: Buffer, i: number): ObjectHeader {
    const start = i;
    const type = ((buffer[i] & 0b01110000) >> 4) as ObjectType;
    let size = buffer[i] & 0b00001111;
    let offset = 4;

    while (buffer[i] & 0x80) {
      i++;
      size += (buffer[i] & 0b01111111) << offset;
      offset += 7;
    }
    i++;

    const objHeader: ObjectHeader = {
      objectSize: size,
      objectType: type,
      parsedBytes: i - start,
    };

    return objHeader;
  }

  async decompressPackFileObject(
    compressedData: Buffer,
    objectSize: number
  ): Promise<DecompressedZlibContent> {
    return new Promise((resolve, reject) => {
      const inflater = zlib.createInflate();
      let decompressedData = Buffer.alloc(0);

      inflater.write(compressedData);
      inflater.end();

      inflater.on("data", (data) => {
        decompressedData = Buffer.concat([
          new Uint8Array(decompressedData),
          new Uint8Array(data),
        ]);

        if (decompressedData.length > objectSize) {
          throw new Error("Decompressed length exceeded");
        }
      });

      inflater.on("end", () => {
        resolve({
          parsedBytes: inflater.bytesWritten,
          objectContent: decompressedData,
        });
      });

      inflater.on("error", (err) => {
        reject(err);
      });
    });
  }
}
