import crypto from "crypto";
import fs from "fs";

import type {
  IDecodedValue,
  IDiscoverPeersParams,
  Torrent,
  TorrentInfo,
} from "./model";
import { encodeDict } from "./encodeToBencode";
import { decodeBencode } from "./decodeBencode";

export function generateHexHashUniqueId(): string {
  const hash: string = crypto
    .createHash("sha1")
    .update(Date.now().toString())
    .digest("hex");
  return hash.slice(0, 20);
}

export function getDiscoverPeersParams(
  peer_id: string,
  port: number,
  uploaded: number,
  downloaded: number,
  left: number,
  compact: number,
): IDiscoverPeersParams {
  return {
    peer_id,
    port,
    uploaded,
    downloaded,
    left,
    compact,
  };
}

// Prepare binary data to be sent over the web
export function urlEncodeBinary(buffer: Buffer): string {
  return [...buffer]
    .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
    .join("");
}

export function parseTorrentObject(torrentFile: string): Torrent {
  const fileContent: string = fs.readFileSync(torrentFile, "binary");

  const [dict]: [IDecodedValue, number] = decodeBencode(fileContent);

  const torrent = dict as Torrent;
  return torrent;
}

export function getHexHashedPieces(binaryString: string): string[] {
  const result: string[] = [];

  for (let pos = 0; pos < binaryString.length; pos += 20) {
    result.push(
      Buffer.from(binaryString.slice(pos, pos + 20), "binary").toString("hex"),
    );
  }

  return result;
}

export function generateTorrentInfoHashBuffer(
  torrentInfo: TorrentInfo,
): Buffer {
  const encodedInfo: string = encodeDict(torrentInfo);
  return crypto.createHash("sha1").update(encodedInfo, "binary").digest();
}
