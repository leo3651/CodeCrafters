import axios from "axios";

import { decodeBencode } from "./decodeBencode";
import {
  generateSha1UniqueId,
  generateTorrentInfoHashBuffer,
  getParamsDiscoverPeers,
  urlEncodeBinary,
} from "./utils";
import type { Torrent } from "./model";

export async function discoverPeers(url: string, torrent: Torrent) {
  try {
    const urlEncodedInfoHash = urlEncodeBinary(
      generateTorrentInfoHashBuffer(torrent.info)
    );
    const paramsDiscoverPeers = getParamsDiscoverPeers(
      generateSha1UniqueId(),
      6881,
      0,
      0,
      torrent.info.length,
      1
    );
    const response = await axios.get(`${url}?info_hash=${urlEncodedInfoHash}`, {
      params: { ...paramsDiscoverPeers },
      responseType: "arraybuffer",
    });

    const bencodedDict = response.data.toString("binary");
    const [decodedDict, _] = decodeBencode(bencodedDict);
    const trackerResponse = decodedDict as {
      interval: number;
      "min interval": number;
      peers: string;
      complete: number;
      incomplete: number;
    };

    return getIPAdresses(trackerResponse.peers);
  } catch (err) {
    console.log(err);
    throw new Error("Discover peers failed");
  }
}

function getIPAdresses(binaryString: string) {
  const peers = [];

  for (let pos = 0; pos < binaryString.length; pos += 6) {
    const portBytes = Buffer.from(binaryString, "binary").slice(
      pos + 4,
      pos + 6
    );
    const port = (portBytes[0] << 8) | portBytes[1]; // Combine bytes in big-endian order

    const ip = [
      ...Buffer.from(binaryString, "binary").slice(pos, pos + 4),
    ].join(".");

    console.log(`${ip}:${port}`);
    peers.push(`${ip}:${port}`);
  }

  return peers;
}
