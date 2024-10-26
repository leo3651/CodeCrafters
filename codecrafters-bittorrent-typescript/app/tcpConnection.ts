import * as net from "net";
import { generateTorrentInfoHashBuffer } from "./utils";

import type { Torrent } from "./model";
import {
  createHandshake,
  getPiecesLength,
  requestPiece,
  savePieceToFile,
  sendHandshake,
  sendInterested,
} from "./helperTcpConnection";
import {
  createExtensionHandshake,
  handleExtensionHandshake,
  handleExtensionMessage,
} from "./magnetLinks";

let allCollectedPieces = Buffer.alloc(0);
let buffer = Buffer.alloc(0);
let piecesLength: number[] = [];
let pieceIndex = 0;
let offset: number = 0;
let extensionHandshakeReceived: boolean = false;
let globalPieceIndexToDownload: number | null = null;
let globalSaveToFilePath: string | null = null;

export function createTcpConnection(
  peerIp: string,
  peerPort: string,
  torrent: Torrent | null = null,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null,
  magnetHandshake: boolean = false,
  hexHashedInfoFromMagnetLink: string | null = null
) {
  globalPieceIndexToDownload = pieceIndexToDownload;
  globalSaveToFilePath = saveToFilePath;
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
        torrent
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
  torrent: Torrent | null = null
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
      handleBitTorrentMessages(data.slice(68), socket, pieceLen, torrent);
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
      if (globalPieceIndexToDownload !== null) {
        pieceLen = piecesLength[globalPieceIndexToDownload];
        requestPiece(socket, pieceLen, globalPieceIndexToDownload);
      } else {
        if (piecesLength[pieceIndex]) {
          requestPiece(socket, piecesLength[pieceIndex], pieceIndex);
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

    // PIECE BLOCK MESSAGE
    else if (messageId === 7) {
      console.log("Received block piece message");
      const blockData = message.slice(13);
      offset += blockData.length;

      allCollectedPieces = Buffer.concat([
        new Uint8Array(allCollectedPieces),
        new Uint8Array(blockData),
      ]);

      if (
        globalPieceIndexToDownload !== null &&
        globalSaveToFilePath &&
        offset === piecesLength[globalPieceIndexToDownload]
      ) {
        savePieceToFile(allCollectedPieces, globalSaveToFilePath);
        socket.end();
        return;
      }

      if (offset === piecesLength[pieceIndex]) {
        offset = 0;
        if (globalPieceIndexToDownload === null && globalSaveToFilePath) {
          pieceIndex++;
          pieceLen = piecesLength[pieceIndex];

          if (pieceIndex < piecesLength.length) {
            requestPiece(socket, pieceLen, pieceIndex);
          } else {
            if (globalSaveToFilePath) {
              savePieceToFile(allCollectedPieces, globalSaveToFilePath);
            }
            socket.end();
          }
        }
      }
    }

    // EXTENSION HANDSHAKE
    else if (messageId === 20) {
      console.log("Received extension message");
      if (!extensionHandshakeReceived) {
        handleExtensionHandshake(message, socket);
        extensionHandshakeReceived = true;
      } else {
        const torrentInfo = handleExtensionMessage(message, socket);
        piecesLength = getPiecesLength(
          torrentInfo.length,
          torrentInfo["piece length"]
        );

        if (
          process.argv[2] === "magnet_download_piece" ||
          process.argv[2] === "magnet_download"
        ) {
          sendInterested(socket);
        }
      }
    }
  }
}
