import * as net from "net";

import { decodeBencode } from "./decodeBencode";
import { encodeDict } from "./encodeToBencode";
import type { MagnetLink, TorrentInfo } from "./model";
import { getHexHashedPieces } from "./utils";

export function parseMagnetLink(magnetLink: string) {
  if (!magnetLink.startsWith("magnet:?")) {
    throw new Error("Invalid magnet link");
  }

  const magnetLinkParamsObject = magnetLink
    .slice(magnetLink.indexOf("?") + 1)
    .split("&")
    .reduce((acc, query) => {
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

  console.log(`Tracker URL: ${magnetLinkParamsObject.tr}`);
  console.log(`Info Hash: ${magnetLinkParamsObject.xt}`);

  return magnetLinkParamsObject;
}

export function createExtensionHandshake() {
  const messageLen = Buffer.alloc(4);
  const messageId = Buffer.from([20]);
  const extensionMessageId = Buffer.alloc(1);
  extensionMessageId.writeUInt8(0, 0);

  const dictionary = {
    m: {
      ut_metadata: 16,
      ut_pex: 2,
    },
  };
  const bencodedDict = encodeDict(dictionary);

  const payload = Buffer.concat([
    new Uint8Array(extensionMessageId),
    new Uint8Array(Buffer.from(bencodedDict)),
  ]);

  messageLen.writeUInt32BE(payload.length + 1, 0);

  return new Uint8Array(
    Buffer.concat([
      new Uint8Array(messageLen),
      new Uint8Array(messageId),
      new Uint8Array(payload),
    ])
  );
}

function requestMetadata(peerMetadataId: number) {
  const messageLen = Buffer.alloc(4);
  const messageId = Buffer.from([20]);

  const bencodedDict = encodeDict({ msg_type: 0, piece: 0 });
  const payload = Buffer.concat([
    new Uint8Array(Buffer.from([peerMetadataId])),
    new Uint8Array(Buffer.from(bencodedDict)),
  ]);
  messageLen.writeUInt32BE(payload.length + 1, 0);

  return new Uint8Array(
    Buffer.concat([
      new Uint8Array(messageLen),
      new Uint8Array(messageId),
      new Uint8Array(payload),
    ])
  );
}

export function handleExtensionHandshake(
  extensionHandshakeMessage: Buffer,
  socket: net.Socket
) {
  const [decodedDict, _] = decodeBencode(
    extensionHandshakeMessage.slice(6).toString("binary")
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

  const peerId = extensionHandshake.m.ut_metadata;

  console.log(`Peer Metadata Extension ID: ${peerId}`);
  socket.write(requestMetadata(peerId));

  if (process.argv[2] === "magnet_handshake") {
    socket.end();
  }
}

export function handleExtensionMessage(
  extensionMessage: Buffer,
  socket: net.Socket
) {
  const [decodedDict, _] = decodeBencode(
    extensionMessage.slice(6).toString("binary")
  );
  const dictInfo = decodedDict as {
    msg_type: number;
    piece: number;
    total_size: number;
  };

  const [decodedMetadataPieceContents, __] = decodeBencode(
    extensionMessage
      .slice(extensionMessage.length - dictInfo.total_size)
      .toString("binary")
  );
  const torrentInfo = decodedMetadataPieceContents as any as TorrentInfo;

  console.log(`Length: ${torrentInfo.length}`);
  console.log(`Piece Length: ${torrentInfo["piece length"]}`);
  console.log("Piece Hashes:");
  getHexHashedPieces(torrentInfo.pieces).forEach((piece) => console.log(piece));

  if (process.argv[2] === "magnet_info") {
    socket.end();
  }

  return torrentInfo;
}
