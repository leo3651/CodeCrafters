import * as net from "net";

import { decodeBencode } from "./decodeBencode";
import { encodeDict } from "./encodeToBencode";
import type {
  DecodedDict,
  IDecodedValue,
  MagnetLink,
  TorrentInfo,
} from "./model";
import { getHexHashedPieces } from "./utils";

export function parseMagnetLink(magnetLink: string): MagnetLink {
  if (!magnetLink.startsWith("magnet:?")) {
    throw new Error("Invalid magnet link");
  }

  const magnetLinkParamsObject: MagnetLink = magnetLink
    .slice(magnetLink.indexOf("?") + 1)
    .split("&")
    .reduce((acc: MagnetLink, query: string) => {
      let [key, value] = query.split("=");

      if (key === "xt") {
        value = value.slice(9);
      }
      if (key === "tr") {
        value = decodeURIComponent(value);
      }

      acc[key] = value;

      return acc;
    }, {} as MagnetLink);

  return magnetLinkParamsObject;
}

export function createExtensionHandshakeBuffer(): Uint8Array {
  const messageLen: Buffer = Buffer.alloc(4);
  const messageId: Buffer = Buffer.from([20]);
  const extensionMessageId: Buffer = Buffer.alloc(1);
  extensionMessageId.writeUInt8(0, 0);

  const dictionary: DecodedDict = {
    m: {
      ut_metadata: 16,
      ut_pex: 2,
    },
  };
  const bencodedDict: string = encodeDict(dictionary);

  const payload: Buffer = Buffer.concat([
    new Uint8Array(extensionMessageId),
    new Uint8Array(Buffer.from(bencodedDict)),
  ]);

  messageLen.writeUInt32BE(payload.length + 1, 0);

  return new Uint8Array(
    Buffer.concat([
      new Uint8Array(messageLen),
      new Uint8Array(messageId),
      new Uint8Array(payload),
    ]),
  );
}

function createExtMetadataReqBuffer(peerMetadataId: number): Uint8Array {
  const messageLen: Buffer = Buffer.alloc(4);
  const messageId: Buffer = Buffer.from([20]);

  const bencodedDict: string = encodeDict({ msg_type: 0, piece: 0 });
  const payload: Buffer = Buffer.concat([
    new Uint8Array(Buffer.from([peerMetadataId])),
    new Uint8Array(Buffer.from(bencodedDict)),
  ]);

  messageLen.writeUInt32BE(payload.length + 1, 0);

  return new Uint8Array(
    Buffer.concat([
      new Uint8Array(messageLen),
      new Uint8Array(messageId),
      new Uint8Array(payload),
    ]),
  );
}

export function createReqExtMetadataBuffer(
  extensionHandshakeMessage: Buffer,
): Uint8Array {
  const [decodedDict, _]: [IDecodedValue, number] = decodeBencode(
    extensionHandshakeMessage.subarray(6).toString("binary"),
  );
  const extensionHandshake = decodedDict as {
    m: {
      ut_metadata: number;
      ut_pex: number;
    };
    metadata_size: number;
    reqq: number;
    v: string;
    yourip: string;
  };

  const peerId: number = extensionHandshake.m.ut_metadata;

  console.log(`Peer Metadata Extension ID: ${peerId}`);

  return createExtMetadataReqBuffer(peerId);
}

export function parseTorrentInfoFromExt(extensionMessage: Buffer) {
  const [decodedDict, _]: [IDecodedValue, number] = decodeBencode(
    extensionMessage.subarray(6).toString("binary"),
  );
  const dictInfo = decodedDict as {
    msg_type: number;
    piece: number;
    total_size: number;
  };

  const [decodedMetadataPieceContents, __]: [IDecodedValue, number] =
    decodeBencode(
      extensionMessage
        .subarray(extensionMessage.length - dictInfo.total_size)
        .toString("binary"),
    );
  const torrentInfo: TorrentInfo =
    decodedMetadataPieceContents as any as TorrentInfo;

  console.log(`Length: ${torrentInfo.length}`);
  console.log(`Piece Length: ${torrentInfo["piece length"]}`);
  console.log("Piece Hashes:");
  getHexHashedPieces(torrentInfo.pieces).forEach((piece) => console.log(piece));

  return torrentInfo;
}
