export interface Entry {
  name: string;
  mode: string;
  sha1Hash: Buffer;
}

export enum ObjectType {
  OBJ_COMMIT = 1,
  OBJ_TREE = 2,
  OBJ_BLOB = 3,
  OBJ_TAG = 4,
  OBJ_OFS_DELTA = 6,
  OBJ_REF_DELTA = 7,
}

export interface ObjectHeader {
  objectType: ObjectType;
  objectSize: number;
  parsedBytes: number;
}

export interface DecompressedZlibContent {
  parsedBytes: number;
  objectContent: Buffer;
}

export interface DecompressedObject extends DecompressedZlibContent {
  objectType: ObjectType;
  ref?: Buffer;
}

export interface gitObjectFile {
  sha1Hash: Buffer;
  fileContent: Buffer;
}
