import axios, { type AxiosResponse } from "axios";
import { decodeBencode } from "./decodeBencode";
import {
  generateHexHashUniqueId,
  generateTorrentInfoHashBuffer,
  getDiscoverPeersParams,
  urlEncodeBinary,
} from "./utils";
import type { IDecodedValue, IDiscoverPeersParams, Torrent } from "./model";

export async function discoverPeers(
  url: string,
  torrent: Torrent | null,
  magnetLinkHexHashedInfo: string | null,
): Promise<string[]> {
  try {
    let urlEncodedInfoHash: string = "";
    const discoverPeersParams: IDiscoverPeersParams = getDiscoverPeersParams(
      generateHexHashUniqueId(),
      6881,
      0,
      0,
      torrent ? torrent.info.length : 999,
      1,
    );

    // Torrent
    if (torrent) {
      urlEncodedInfoHash = urlEncodeBinary(
        generateTorrentInfoHashBuffer(torrent.info),
      );
    }

    // Magnet link
    else if (magnetLinkHexHashedInfo) {
      urlEncodedInfoHash = urlEncodeBinary(
        Buffer.from(magnetLinkHexHashedInfo, "hex"),
      );
    }

    const response: AxiosResponse<any, any> = await axios.get(
      `${url}?info_hash=${urlEncodedInfoHash}`,
      {
        params: { ...discoverPeersParams },
        responseType: "arraybuffer",
      },
    );

    const bencodedDict: string = response.data.toString("binary");
    const [decodedDict]: [IDecodedValue, number] = decodeBencode(bencodedDict);

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

function getIPAdresses(binaryString: string): string[] {
  const peers: string[] = [];

  for (let pos = 0; pos < binaryString.length; pos += 6) {
    const portBytes: Buffer = Buffer.from(binaryString, "binary").subarray(
      pos + 4,
      pos + 6,
    );

    // Combine bytes in big-endian order
    const port: number = (portBytes[0] << 8) | portBytes[1];

    const ip: string = [
      ...Buffer.from(binaryString, "binary").subarray(pos, pos + 4),
    ].join(".");

    peers.push(`${ip}:${port}`);
  }

  return peers;
}
