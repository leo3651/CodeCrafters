import crypto from "crypto";
import fs from "fs";

import type { ParamsDiscoverPeers, Torrent, TorrentInfo } from "./model";
import { encodeDict } from "./encodeToBencode";
import { decodeBencode } from "./decodeBencode";

export function generateSha1UniqueId() {
  const hash = crypto
    .createHash("sha1")
    .update(Date.now().toString())
    .digest("hex");
  return hash.slice(0, 20); // Take the first 20 characters from the hex string
}

export function getParamsDiscoverPeers(
  peer_id: string,
  port: number,
  uploaded: number,
  downloaded: number,
  left: number,
  compact: number
): ParamsDiscoverPeers {
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
export function urlEncodeBinary(buffer: Buffer) {
  return [...buffer].map((b) => `%${b.toString(16).padStart(2, "0")}`).join("");
}

export function parseTorrentObject(torrentFile: string) {
  const fileContent = fs.readFileSync(torrentFile, "binary");
  const [dict, dictLen] = decodeBencode(fileContent);
  const torrent = dict as Torrent;
  return torrent;
}

export function getHexHashedPieces(binaryDataString: string): string[] {
  const result: string[] = [];

  for (let pos = 0; pos < binaryDataString.length; pos += 20) {
    result.push(
      Buffer.from(binaryDataString.slice(pos, pos + 20), "binary").toString(
        "hex"
      )
    );
  }

  return result;
}

export function generateTorrentInfoHashBuffer(torrentInfo: TorrentInfo) {
  const encodedInfo = encodeDict(torrentInfo);
  return crypto.createHash("sha1").update(encodedInfo, "binary").digest();
}
