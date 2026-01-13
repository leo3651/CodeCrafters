import { ObjectType } from "./model";
import crypto from "crypto";

export const REF_SIZE = 20;

export function createSha1HexHash(content: Buffer): Buffer {
  return crypto.createHash("sha1").update(new Uint8Array(content)).digest();
}

export function getGitObjectType(type: string): ObjectType {
  if (type.trim() === "commit") {
    return ObjectType.OBJ_COMMIT;
  } else if (type.trim() === "tree") {
    return ObjectType.OBJ_TREE;
  } else if (type.trim() === "blob") {
    return ObjectType.OBJ_BLOB;
  }
  throw new Error("Object type does not exists");
}

export function readLittleEndianBytes(data: number[]): number {
  let value: number = 0;

  for (let i = 0; i < data.length; i++) {
    value += data[i] << (i * 8);
  }

  return value;
}
