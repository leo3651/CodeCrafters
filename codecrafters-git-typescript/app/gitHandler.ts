import zlib from "node:zlib";
import fs from "fs";
import crypto from "crypto";
import {
  ObjectType,
  type Entry,
  type ObjectHeader,
  type DecompressedZlibContent,
  type DecompressedObject,
  type GitObjectFile,
  type DeltaGitObject,
} from "./model";
import axios, { type AxiosResponse } from "axios";

const REF_SIZE = 20;

export class GitHandler {
  constructor() {}

  gitInit(basePath = ""): void {
    fs.mkdirSync(`${basePath}.git`, { recursive: true });
    fs.mkdirSync(`${basePath}.git/objects`, { recursive: true });
    fs.mkdirSync(`${basePath}.git/refs`, { recursive: true });
    fs.writeFileSync(`${basePath}.git/HEAD`, `ref: refs/heads/main\n`);
    console.log(`Initialized git directory`);
  }

  readBlobObject(blobSha1Hash: string, basePath: string = ""): Buffer {
    const { payload } = this.readGitObject(blobSha1Hash, basePath);
    return payload;
  }

  writeBlobObject(path: string, fileName: string): string {
    const fileContent = fs.readFileSync(`${path}/${fileName}`);
    const blobGitObject = this.createBlobObject(fileContent);

    this.writeGitObject(
      blobGitObject.fileContent,
      blobGitObject.sha1Hash.toString("hex")
    );

    return blobGitObject.sha1Hash.toString("hex");
  }

  createBlobObject(blobContent: Buffer): GitObjectFile {
    const blobFile = Buffer.concat([
      new Uint8Array(Buffer.from(`blob ${blobContent.length}\0`)),
      new Uint8Array(blobContent),
    ]);

    return {
      sha1Hash: this.createSha1HexHash(blobFile),
      sha1HexHash: this.createSha1HexHash(blobFile).toString("hex"),
      fileContent: blobFile,
      payload: blobContent,
      type: this.getGitObjectType("blob"),
      length: blobContent.length,
    };
  }

  readTreeObject(treeSha1Hash: string, basePath: string = ""): Entry[] {
    const { payload } = this.readGitObject(treeSha1Hash, basePath);
    return this.parseTreeObjectEntries(payload);
  }

  parseTreeObjectEntries(entries: Buffer): Entry[] {
    const parsedEntries: Entry[] = [];

    while (entries.length) {
      const spaceCharIndex = entries.indexOf(32);
      const nullByteIndex = entries.indexOf(0);

      const mode = entries.slice(0, spaceCharIndex).toString();
      const name = entries.slice(spaceCharIndex + 1, nullByteIndex).toString();
      const sha1Hash = entries.slice(nullByteIndex + 1, nullByteIndex + 1 + 20);
      const sha1HexHash = sha1Hash.toString("hex");

      parsedEntries.push({
        name,
        mode,
        sha1Hash,
        sha1HexHash,
      } as Entry);

      const nextOffset = mode.length + name.length + 1 + sha1Hash.length + 1;
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
    this.writeGitObject(
      treeGitObject.fileContent,
      treeGitObject.sha1Hash.toString("hex")
    );

    return treeGitObject.sha1Hash;
  }

  createTreeObject(entries: Entry[]): GitObjectFile {
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
      sha1Hash: this.createSha1HexHash(treeFile),
      sha1HexHash: this.createSha1HexHash(treeFile).toString("hex"),
      fileContent: treeFile,
      payload: content,
      type: this.getGitObjectType("tree"),
      length: content.length,
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
    this.writeGitObject(
      commitGitObject.fileContent,
      commitGitObject.sha1Hash.toString("hex")
    );

    return commitGitObject.sha1Hash.toString("hex");
  }

  createCommitObject(commitContent: Buffer): GitObjectFile {
    const commitFile = Buffer.concat([
      new Uint8Array(Buffer.from(`commit ${commitContent.length}\0`)),
      new Uint8Array(commitContent),
    ]);

    return {
      sha1Hash: this.createSha1HexHash(commitFile),
      sha1HexHash: this.createSha1HexHash(commitFile).toString("hex"),
      fileContent: commitFile,
      payload: commitContent,
      type: this.getGitObjectType("commit"),
      length: commitContent.length,
    };
  }

  writeGitObject(content: Buffer, sha1Hash: string, basePath = ""): void {
    const compressedFile = new Uint8Array(
      zlib.deflateSync(new Uint8Array(content))
    );

    const dir = sha1Hash.slice(0, 2);
    const file = sha1Hash.slice(2);

    fs.mkdirSync(`${basePath}.git/objects/${dir}`, { recursive: true });
    fs.writeFileSync(`${basePath}.git/objects/${dir}/${file}`, compressedFile);
  }

  readGitObject(fileSha1Hash: string, basePath = ""): GitObjectFile {
    const dir = fileSha1Hash.slice(0, 2);
    const file = fileSha1Hash.slice(2);

    const fileContent = fs.readFileSync(
      `${basePath}.git/objects/${dir}/${file}`
    );

    const decompressedFileContent = zlib.unzipSync(new Uint8Array(fileContent));

    const nullByteIndex = decompressedFileContent.indexOf("\0");
    const header = decompressedFileContent
      .toString()
      .slice(0, nullByteIndex)
      .split(" ");

    const type = this.getGitObjectType(header[0]);
    const length = parseInt(header[1]);
    const payload = decompressedFileContent.slice(nullByteIndex + 1);

    return {
      sha1Hash: Buffer.from(fileSha1Hash, "hex"),
      sha1HexHash: fileSha1Hash,
      fileContent: decompressedFileContent,
      payload,
      type,
      length,
    };
  }

  createSha1HexHash(content: Buffer): Buffer {
    return crypto.createHash("sha1").update(new Uint8Array(content)).digest();
  }

  getGitObjectType(type: string): ObjectType {
    if (type.trim() === "commit") {
      return ObjectType.OBJ_COMMIT;
    } else if (type.trim() === "tree") {
      return ObjectType.OBJ_TREE;
    } else if (type.trim() === "blob") {
      return ObjectType.OBJ_BLOB;
    }
    throw new Error("Object type does not exists");
  }

  async clone(cloneURL: string, dir: string) {
    // HANDLE REQUESTS
    const { packHash, ref } = await this.getPackFileHash(cloneURL);
    const res = await this.getPackFileFromServer(cloneURL, packHash);
    const { objects, checksumHash } = await this.getRawGitObjectsContent(
      res.data
    );

    console.log("reference:", ref);
    console.log("checksum hash:", checksumHash);
    const { gitObjects, deltaObjects } = await this.createGitObjects(objects);

    fs.mkdirSync(dir);
    this.gitInit(`${dir}/`);

    fs.writeFileSync(`${dir}/.git/HEAD`, `ref: ${ref}`);
    fs.mkdirSync(`${dir}/.git/refs/heads`, { recursive: true });
    fs.writeFileSync(`${dir}/.git/refs/heads/${ref.split("/")[2]}`, packHash);

    for (const gitObj of gitObjects) {
      this.writeGitObject(
        gitObj.fileContent,
        gitObj.sha1Hash.toString("hex"),
        `${dir}/`
      );
    }

    console.log(deltaObjects);
    this.resolveDeltaObjects(deltaObjects, `${dir}/`);
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

  async getRawGitObjectsContent(
    responseData: Buffer
  ): Promise<{ objects: DecompressedObject[]; checksumHash: Buffer }> {
    const packData: Buffer = responseData.slice(4);
    const packObjCount = packData.readUInt32BE(12);
    const packObjects = packData.slice(16);
    let i = 0;
    const objects: DecompressedObject[] = [];

    for (let count = 0; count < packObjCount; count++) {
      const obj = await this.parsePackFile(packObjects, i);
      i += obj.parsedBytes;

      objects.push(obj);
    }

    const checksumHash = responseData.slice(responseData.length - 20);
    i += 20;

    return { objects, checksumHash };
  }

  async parsePackFile(
    packObjBuffer: Buffer,
    i: number
  ): Promise<DecompressedObject> {
    const objHeader = this.parsePackFileObjectHeader(packObjBuffer, i);
    i += objHeader.parsedBytes;

    // Delta object
    if (ObjectType.OBJ_REF_DELTA === objHeader.objectType) {
      const deltaRef = packObjBuffer.slice(i, i + REF_SIZE);
      const { objectContent, parsedBytes } =
        await this.decompressPackFileObject(
          packObjBuffer.slice(i + REF_SIZE),
          objHeader.objectSize
        );
      return {
        objectContent,
        parsedBytes: parsedBytes + objHeader.parsedBytes + REF_SIZE,
        objectType: objHeader.objectType,
        deltaRef,
      };
    }

    // Non delta objects
    else {
      const { objectContent, parsedBytes } =
        await this.decompressPackFileObject(
          packObjBuffer.slice(i),
          objHeader.objectSize
        );
      return {
        objectContent,
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

  async createGitObjects(objects: DecompressedObject[]): Promise<{
    gitObjects: GitObjectFile[];
    deltaObjects: DeltaGitObject[];
  }> {
    const gitObjects: GitObjectFile[] = [];
    const deltaObjects: DeltaGitObject[] = [];

    objects.forEach((object) => {
      if (object.objectType === ObjectType.OBJ_REF_DELTA) {
        if (!object.deltaRef) {
          throw new Error("Delta object has no reference");
        }
        deltaObjects.push(
          this.createDeltaGitObject(
            object.objectContent,
            object.objectType,
            object.deltaRef
          )
        );
      } else {
        gitObjects.push(
          this.createGitObjectFile(object.objectContent, object.objectType)
        );
      }
    });

    return { gitObjects, deltaObjects };
  }

  createDeltaGitObject(
    objectContent: Buffer,
    objectType: ObjectType,
    deltaRef: Buffer
  ): DeltaGitObject {
    return {
      ref: deltaRef,
      instructions: objectContent,
      type: objectType,
      refHex: deltaRef.toString("hex"),
    };
  }

  createGitObjectFile(
    objectContent: Buffer,
    objectType: ObjectType
  ): GitObjectFile {
    let gitObjectFileContent = Buffer.alloc(0);
    let gitObjectFileSha1Hash = Buffer.alloc(0);

    // Commit object
    if (objectType === ObjectType.OBJ_COMMIT) {
      const { sha1Hash, fileContent } = this.createCommitObject(objectContent);
      gitObjectFileContent = fileContent;
      gitObjectFileSha1Hash = sha1Hash;
    }

    // Tree object
    else if (objectType === ObjectType.OBJ_TREE) {
      const entries = this.parseTreeObjectEntries(objectContent);
      const { sha1Hash, fileContent } = this.createTreeObject(entries);
      gitObjectFileContent = fileContent;
      gitObjectFileSha1Hash = sha1Hash;
    }

    // Blob object
    else if (objectType === ObjectType.OBJ_BLOB) {
      const { fileContent, sha1Hash } = this.createBlobObject(objectContent);
      gitObjectFileContent = fileContent;
      gitObjectFileSha1Hash = sha1Hash;
    }

    return {
      sha1Hash: gitObjectFileSha1Hash,
      sha1HexHash: gitObjectFileSha1Hash.toString("hex"),
      fileContent: gitObjectFileContent,
      payload: objectContent,
      type: objectType,
      length: objectContent.length,
    };
  }

  resolveDeltaObjects(deltaObjects: DeltaGitObject[], basePath: string): void {
    const pendingDeltaObjects: DeltaGitObject[] = [];

    for (const deltaObj of deltaObjects) {
      try {
        const referencedGitObject = this.readGitObject(
          deltaObj.ref.toString("hex"),
          basePath
        );
        const appliedDeltaContent = this.applyDeltaInstructions(
          deltaObj.instructions,
          referencedGitObject.payload
        );
        const resolvedDeltaObject = this.createGitObjectFile(
          appliedDeltaContent,
          referencedGitObject.type
        );
        this.writeGitObject(
          resolvedDeltaObject.fileContent,
          resolvedDeltaObject.sha1Hash.toString("hex"),
          basePath
        );
      } catch (err) {
        pendingDeltaObjects.push(deltaObj);
      }
    }

    if (pendingDeltaObjects.length) {
      this.resolveDeltaObjects(pendingDeltaObjects, basePath);
    }
  }

  applyDeltaInstructions(
    instructions: Buffer,
    referencedObjectContent: Buffer
  ): Buffer {
    let appliedDeltaContent = Buffer.alloc(0);
    let i = 0;

    const {
      size: referencedGitObjectSize,
      parsedBytes: referencedGitObjectParsedBytes,
    } = this.parseSize(instructions, i);
    i += referencedGitObjectParsedBytes;

    const {
      size: targetGitObjectSize,
      parsedBytes: targetGitObjectParsedBytes,
    } = this.parseSize(instructions, i);
    i += targetGitObjectParsedBytes;

    while (i < instructions.length) {
      // Copy instruction
      if (instructions[i] & 0x80) {
        const { offset, size, parsedBytes } = this.parseCopyInstruction(
          instructions,
          i
        );
        const copyContent = new Uint8Array(
          referencedObjectContent.slice(offset, offset + size)
        );
        appliedDeltaContent = Buffer.concat([
          new Uint8Array(appliedDeltaContent),
          copyContent,
        ]);
        i += parsedBytes;
      }

      // Insert instruction
      else {
        const { insertContent, parsedBytes } = this.parseInsertInstruction(
          instructions,
          i
        );

        appliedDeltaContent = Buffer.concat([
          new Uint8Array(appliedDeltaContent),
          new Uint8Array(insertContent),
        ]);

        i += parsedBytes;
      }
    }

    return appliedDeltaContent;
  }

  parseSize(
    instructions: Buffer,
    i: number
  ): { parsedBytes: number; size: number } {
    let parsedBytes = 1;
    let size = instructions[i];
    let offset = 7;

    while (instructions[i] & 0x80) {
      i++;
      parsedBytes++;
      size += (instructions[i] & 0b01111111) << offset;
      offset += 7;
    }

    return { parsedBytes, size };
  }

  parseInsertInstruction(
    instructions: Buffer,
    i: number
  ): { insertContent: Buffer; parsedBytes: number } {
    const size = instructions[i];
    i++;
    const parsedBytes = size + 1;

    const insertContent = instructions.slice(i, i + size);
    return { insertContent, parsedBytes };
  }

  parseCopyInstruction(
    instructions: Buffer,
    i: number
  ): { offset: number; size: number; parsedBytes: number } {
    const sizeArr: number[] = [];
    const offsetArr: number[] = [];
    const mask = instructions[i];
    i++;
    let parsedBytes = 1;

    for (let n = 0; n < 7; n++) {
      // Lower 3 bits
      if (n < 4) {
        if (mask & (1 << n)) {
          offsetArr.push(instructions[i]);
          i++;
          parsedBytes++;
        } else {
          offsetArr.push(0);
        }
      }

      // Higher 4 bits
      else {
        if (mask & (1 << n)) {
          sizeArr.push(instructions[i]);
          i++;
          parsedBytes++;
        } else {
          sizeArr.push(0);
        }
      }
    }

    const size = this.readLittleEndianBytes(sizeArr);
    const offset = this.readLittleEndianBytes(offsetArr);

    return { offset, size, parsedBytes };
  }

  readLittleEndianBytes(data: number[]): number {
    let value = 0;

    for (let i = 0; i < data.length; i++) {
      value += data[i] << (i * 8);
    }

    return value;
  }
}
