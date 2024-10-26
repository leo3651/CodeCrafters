import * as net from "net";
import { generateTorrentInfoHashBuffer } from "./utils";

import type { DecodedDict, Torrent } from "./model";
import {
  createHandshake,
  getPiecesLength,
  requestPiece,
  savePieceToFile,
  sendHandshake,
  sendInterested,
} from "./helperTcpConnection";
import { decodeBencode } from "./decodeBencode";
import { createExtensionHandshake } from "./magnetLinks";

let allCollectedPieces = Buffer.alloc(0);
let buffer = Buffer.alloc(0);
let piecesLength: number[] = [];
let pieceIndex = 0;
let offset: number = 0;

export function createTcpConnection(
  peerIp: string,
  peerPort: string,
  torrent: Torrent | null = null,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null,
  magnetHandshake: boolean = false,
  hexHashedInfoFromMagnetLink: string | null = null
) {
  let torrentInfoHashBuffer: Buffer;
  if (torrent) {
    torrentInfoHashBuffer = generateTorrentInfoHashBuffer(torrent.info);
    piecesLength = getPiecesLength(
      torrent.info.length,
      torrent.info["piece length"]
    );
  } else if (hexHashedInfoFromMagnetLink) {
    torrentInfoHashBuffer = Buffer.from(hexHashedInfoFromMagnetLink, "hex");
  }

  const socket = net.createConnection(
    { host: peerIp, port: parseInt(peerPort) },
    () => {
      const handshake = createHandshake(torrentInfoHashBuffer, magnetHandshake);
      sendHandshake(socket, handshake);
    }
  );

  socket.on("data", (data) => {
    if (torrent) {
      handleBitTorrentMessages(
        data,
        socket,
        torrent.info["piece length"],
        torrent,
        saveToFilePath,
        pieceIndexToDownload
      );
    } else {
      handleBitTorrentMessages(data, socket);
    }
  });

  socket.on("error", (err) => {
    console.error(err);
  });
}

function handleBitTorrentMessages(
  data: Buffer,
  socket: net.Socket,
  pieceLen: number | null = null,
  torrent: Torrent | null = null,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null
) {
  // Append the new data to the buffer
  buffer = Buffer.concat([new Uint8Array(buffer), new Uint8Array(data)]);

  if (
    buffer[0] === 19 &&
    buffer.slice(1, 20).toString() === "BitTorrent protocol"
  ) {
    const peerId = data.slice(48, 68);
    console.log(`Peer ID: ${peerId.toString("hex")}`);
    if (data[25] === 16) {
      socket.write(createExtensionHandshake());
    }
    buffer = Buffer.alloc(0);

    if (torrent) {
      handleBitTorrentMessages(
        data.slice(68),
        socket,
        pieceLen,
        torrent,
        saveToFilePath,
        pieceIndexToDownload
      );
    } else {
      handleBitTorrentMessages(data.slice(68), socket);
    }
    return;
  }

  // Process all complete messages in the buffer
  while (buffer.length >= 4) {
    // Read the message length from the first 4 bytes
    const messageLen = buffer.readInt32BE(0);

    // Check if the buffer contains the complete message
    if (buffer.length < messageLen + 4) {
      // If not, wait for more data
      break;
    }

    // Extract the complete message
    const message = buffer.slice(0, messageLen + 4);
    buffer = buffer.slice(messageLen + 4); // Remove the processed message from the buffer

    if (messageLen === 0) {
      // Keep-alive message
      continue;
    }

    const messageId = message.readUInt8(4);

    // UNCHOKE MESSAGE
    if (messageId === 1) {
      console.log("Received unchoke message");
      if (pieceIndexToDownload !== null) {
        pieceLen = piecesLength[pieceIndexToDownload];
        requestPiece(socket, pieceLen, pieceIndexToDownload);
      } else {
        if (pieceLen) {
          requestPiece(socket, pieceLen, pieceIndex);
        }
      }
    }

    // BITFIELD MESSAGE
    else if (messageId === 5) {
      console.log("Received bitfield message");
      if (torrent) {
        sendInterested(socket);
      }
    }

    // PIECE MESSAGE
    else if (messageId === 7) {
      console.log("Received block piece message");
      const blockData = message.slice(13);
      offset += blockData.length;

      allCollectedPieces = Buffer.concat([
        new Uint8Array(allCollectedPieces),
        new Uint8Array(blockData),
      ]);

      if (
        pieceIndexToDownload !== null &&
        saveToFilePath &&
        offset === piecesLength[pieceIndexToDownload]
      ) {
        savePieceToFile(allCollectedPieces, saveToFilePath);
        socket.end();
        return;
      }

      if (offset === piecesLength[pieceIndex]) {
        offset = 0;
        if (pieceIndexToDownload === null && saveToFilePath) {
          pieceIndex++;
          pieceLen = piecesLength[pieceIndex];

          if (pieceIndex < piecesLength.length) {
            requestPiece(socket, pieceLen, pieceIndex);
          } else {
            if (saveToFilePath) {
              savePieceToFile(allCollectedPieces, saveToFilePath);
            }
            socket.end();
          }
        }
      }
    }

    // EXTENSION HANDSHAKE
    else if (messageId === 20) {
      console.log("Received extension handshake message");
      const [encodeDict, _] = decodeBencode(
        message.slice(6).toString("binary")
      );
      const extensionHandshake = encodeDict as {
        m: {
          ut_metadata: 1;
          ut_pex: 2;
        };
        metadata_size: 132;
        reqq: 250;
        v: "Rain 0.0.0";
        yourip: "¼N¿";
      };

      console.log(
        `Peer Metadata Extension ID: ${extensionHandshake.m.ut_metadata}`
      );

      socket.end();
    }

    // OTHER MESSAGE TYPES
    else {
      console.log(`Received message with ID: ${messageId}`);
    }
  }
}
