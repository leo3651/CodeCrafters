import fs from "fs";
import crypto from "crypto";
import axios from "axios";

type BencodedValue = string | number | DecodedDict | BencodedValue[];
interface DecodedDict {
  [key: string]: BencodedValue;
}

interface ParamsDiscoverPeers {
  peer_id: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
  compact: number;
}

function decodeBencode(bencodedValue: string): [BencodedValue, number] {
  /* This function is used to decode a bencoded string
    The bencoded string is a string that is prefixed by the length of the string
    **/

  // Decode string
  if (!isNaN(parseInt(bencodedValue[0]))) {
    const firstColonIndex = bencodedValue.indexOf(":");
    if (firstColonIndex === -1) {
      throw new Error("Invalid encoded value");
    }
    const stringLen = parseInt(bencodedValue.split(":")[0]);
    return [
      bencodedValue.slice(firstColonIndex + 1, firstColonIndex + 1 + stringLen),
      firstColonIndex + 1 + stringLen,
    ];
  }

  // Decode int
  if (bencodedValue[0] === "i") {
    const firstEIndex = bencodedValue.indexOf("e");
    return [
      Number.parseFloat(bencodedValue.slice(1, firstEIndex)),
      firstEIndex + 1,
    ];
  }

  // Decode bencoded list
  if (bencodedValue[0] === "l") {
    let offset = 1;
    let decodedArr: BencodedValue = [];

    while (offset < bencodedValue.length) {
      if (bencodedValue[offset] === "e") {
        break;
      }
      const [decodedVal, encodedLen] = decodeBencode(
        bencodedValue.slice(offset)
      );
      decodedArr.push(decodedVal);
      offset += encodedLen;
    }

    return [decodedArr, offset + 1];
  }

  // Decode bencoded dict
  if (bencodedValue[0] === "d") {
    let offset = 1;
    let decodedDict: DecodedDict = {};

    while (offset < bencodedValue.length) {
      if (bencodedValue[offset] === "e") {
        break;
      }

      const [decodedKey, encodedKeyLen] = decodeBencode(
        bencodedValue.slice(offset)
      );
      offset += encodedKeyLen;
      const [decodedValue, encodedValueLen] = decodeBencode(
        bencodedValue.slice(offset)
      );
      offset += encodedValueLen;

      decodedDict[decodedKey as string] = decodedValue;
    }

    return [decodedDict, offset + 1];
  }

  throw new Error("Unsupported type");
}

const encodeString = (str: string) => {
  return `${str.length}:${str}`;
};

const encodeNumber = (number: number) => {
  return `i${number}e`;
};

const encodeList = (list: BencodedValue[]) => {
  let encodedList = "l";
  list.forEach((el) => {
    if (typeof el === "string") {
      encodedList += encodeString(el);
    }
    if (typeof el === "number") {
      encodedList += encodeNumber(el);
    }
    if (Array.isArray(el)) {
      encodeList(el);
    }
    if (typeof el === "object" && !Array.isArray(el)) {
      encodeDict(el);
    }
  });
  return encodedList + "e";
};

const encodeDict = (el: DecodedDict) => {
  let encodedDict = "d";
  Object.entries(el)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, value]) => {
      if (typeof key === "string") {
        encodedDict += encodeString(key);
      } else {
        throw new Error("Invalid key");
      }

      if (typeof value === "string") {
        encodedDict += encodeString(value);
      }
      if (typeof value === "number") {
        encodedDict += encodeNumber(value);
      }
      if (typeof value === "object" && !Array.isArray(value)) {
        encodedDict += encodeDict(value);
      }
      if (Array.isArray(value)) {
        encodedDict += encodeList(value);
      }
    });

  return encodedDict + "e";
};

function getPiecesHashes(binaryDataString: string): string[] {
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

function parseTorrentObject(torrentFile: string) {
  const content = fs.readFileSync(torrentFile, "binary");
  const [dict, dictLen] = decodeBencode(content);
  const torrent = dict as {
    announce: string;
    "created by": string;
    info: {
      length: number;
      name: string;
      "piece length": number;
      pieces: string;
    };
  };
  return torrent;
}

function generateSha1UniqueId() {
  const hash = crypto
    .createHash("sha1")
    .update(Date.now().toString())
    .digest("hex");
  return hash.slice(0, 20); // Take the first 20 characters from the hex string
}

function getParamsDiscoverPeers(
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

function urlEncodeBinary(buffer: Buffer) {
  return [...buffer].map((b) => `%${b.toString(16).padStart(2, "0")}`).join("");
}

async function discoverPeers(
  url: string,
  urlEncodedInfoHash: string,
  torrentLen: number
) {
  const paramsDiscoverPeers = getParamsDiscoverPeers(
    generateSha1UniqueId(),
    6881,
    0,
    0,
    torrentLen,
    1
  );
  const response = await axios.get(`${url}?info_hash=${urlEncodedInfoHash}`, {
    params: { ...paramsDiscoverPeers },
  });
  console.log(response);
  console.log(response.data);
}

const args = process.argv;

if (args[2] === "decode") {
  try {
    const bencodedValue = args[3];
    const [decoded, _] = decodeBencode(bencodedValue);
    console.log(JSON.stringify(decoded));
  } catch (error: any) {
    console.error(error.message);
  }
} else if (args[2] === "info") {
  const torrent = parseTorrentObject(args[3]);
  if (!torrent.announce || !torrent.info) {
    throw new Error("Invalid torrent file");
  }

  console.log(
    `Tracker URL: ${torrent.announce}\nLength: ${torrent.info.length}`
  );

  const encodedInfo = encodeDict(torrent.info);
  const infoHash = crypto
    .createHash("sha1")
    .update(encodedInfo, "binary")
    .digest("hex");
  console.log(`Info Hash: ${infoHash}`);
  console.log(`Piece Length: ${torrent.info["piece length"]}`);

  const hashedHexPieces = getPiecesHashes(torrent.info.pieces);
  console.log("Piece Hashes:");
  hashedHexPieces.forEach((element) => {
    console.log(element);
  });
} else if (args[2] === "peers") {
  const torrent = parseTorrentObject(args[3]);
  const encodedInfo = encodeDict(torrent.info);
  const infoHash = crypto
    .createHash("sha1")
    .update(encodedInfo, "binary")
    .digest();
  const urlEncodedInfoHash = urlEncodeBinary(infoHash);

  discoverPeers(torrent.announce, urlEncodedInfoHash, torrent.info.length);
}
