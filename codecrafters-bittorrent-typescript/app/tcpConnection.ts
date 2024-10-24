import * as net from "net";
import { generateTorrentInfoHashBuffer } from "./utils";

import type { Torrent } from "./model";
import {
  createHandshake,
  getPiecesLength,
  parsePiece,
  requestPiece,
  savePieceToFile,
  sendHandshake,
  sendInterested,
} from "./helperTcpConnection";

let allCollectedPieces = Buffer.alloc(0);
let buffer = Buffer.alloc(0);

export function createTcpConnection(
  peerIp: string,
  peerPort: string,
  torrent: Torrent | null,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null,
  magnetHandshake: boolean = false,
  hexHashedInfoFromMagnetLink: string | null = null
) {
  let torrentInfoHashBuffer: Buffer;
  if (torrent) {
    torrentInfoHashBuffer = generateTorrentInfoHashBuffer(torrent.info);
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
    const peerId = data.slice(48, 68);
    console.log(`Peer ID: ${peerId.toString("hex")}`);

    if (torrent) {
      sendInterested(socket);
      handleBitTorrentMessages(
        data,
        socket,
        torrent.info["piece length"],
        torrent,
        saveToFilePath,
        pieceIndexToDownload
      );
    } else {
      if (data[25] === 16) {
        handleBitTorrentMessages(data, socket);
      }
    }
  });

  socket.on("error", (err) => {
    console.error(err);
  });
}

/* function handlePeerMessages(
  socket: net.Socket,
  pieceLen: number,
  torrent: Torrent,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null
) {
  const torrentLen = torrent.info.length;
  const piecesLength = getPiecesLength(
    torrentLen,
    torrent.info["piece length"]
  );
  let pieceIndex = 0;
  let offset = 0;
  let collectedPiece = Buffer.alloc(0);

  socket.on("data", (data: Buffer) => {
    const messageLen = data.readInt32BE(0);
    const messageId = data.readUInt8(4);

    // UNCHOKE MESSAGE
    if (messageId === 1) {
      console.log("Received unchoke message");
      if (pieceIndexToDownload) {
        pieceLen = piecesLength[pieceIndexToDownload];
        requestPiece(socket, pieceLen, pieceIndexToDownload);
      } else {
        requestPiece(socket, pieceLen, pieceIndex);
      }
    }

    // BITFIELD MESSAGE
    else if (messageId === 5) {
      console.log("Received bitfield message");
    }

    // PIECE MESSAGE
    else if (messageId === 7) {
      console.log("Received piece message");
      const pieceIndex = data.readUInt32BE(5);
      const blockOffset = data.readUInt32BE(9);
      const blockData = data.slice(13);

      console.log(
        `Piece Index: ${pieceIndex}, Block Offset: ${blockOffset}, Block Data Length: ${blockData.length}`
      );

      offset += data.length;

      collectedPiece = Buffer.concat([
        new Uint8Array(collectedPiece),
        new Uint8Array(data),
      ]);
    }

    // PIECE DATA
    else {
      offset += data.length;
      collectedPiece = Buffer.concat([
        new Uint8Array(collectedPiece),
        new Uint8Array(data),
      ]);
    }

    if (offset === pieceLen + numberOfBlocksRequested(pieceLen) * 13) {
      const parsedPiece = parsePiece(collectedPiece);
      offset = 0;

      if (pieceIndexToDownload !== null && saveToFilePath) {
        savePieceToFile(parsedPiece, saveToFilePath);
      }
      if (pieceIndexToDownload === null && saveToFilePath) {
        allCollectedPieces = Buffer.concat([
          new Uint8Array(allCollectedPieces),
          new Uint8Array(parsedPiece),
        ]);
      }

      collectedPiece = Buffer.alloc(0);
      pieceIndex++;
      pieceLen = piecesLength[pieceIndex];

      if (pieceIndex < piecesLength.length && pieceIndexToDownload === null) {
        requestPiece(socket, pieceLen, pieceIndex);
      } else {
        if (pieceIndexToDownload === null && saveToFilePath) {
          savePieceToFile(allCollectedPieces, saveToFilePath);
        }
        socket.end();
      }
    }
  });
} */

function handleBitTorrentMessages(
  data: Buffer,
  socket: net.Socket,
  pieceLen: number | null = null,
  torrent: Torrent | null = null,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null
) {
  let torrentLen;
  let piecesLength: number[] = [];
  let pieceIndex = 0;
  let offset = 0;
  let collectedPiece = Buffer.alloc(0);

  if (torrent) {
    torrentLen = torrent.info.length;
    piecesLength = getPiecesLength(torrentLen, torrent.info["piece length"]);
  }

  // Append the new data to the buffer
  buffer = Buffer.concat([new Uint8Array(buffer), new Uint8Array(data)]);
  console.log(data);

  if (
    buffer[0] === 19 &&
    buffer.slice(1, 20).toString() === "BitTorrent protocol"
  ) {
    buffer = Buffer.alloc(0);
    handleBitTorrentMessages(data.slice(68), socket);
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

    // Handle the message
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
      // Handle the bitfield message if needed
    }

    // PIECE MESSAGE
    else if (messageId === 7) {
      console.log("Received piece message");
      const receivedPieceIndex = message.readUInt32BE(5);
      const blockOffset = message.readUInt32BE(9);
      const blockData = message.slice(13);

      console.log(
        `Piece Index: ${receivedPieceIndex}, Block Offset: ${blockOffset}, Block Data Length: ${blockData.length}`
      );

      collectedPiece = Buffer.concat([
        new Uint8Array(collectedPiece),
        new Uint8Array(blockData),
      ]);
      offset += blockData.length;

      // Check if the piece is fully downloaded
      if (offset === pieceLen) {
        const parsedPiece = parsePiece(collectedPiece);
        offset = 0;
        collectedPiece = Buffer.alloc(0);

        if (pieceIndexToDownload !== null && saveToFilePath) {
          savePieceToFile(parsedPiece, saveToFilePath);
        }
        if (pieceIndexToDownload === null && saveToFilePath) {
          allCollectedPieces = Buffer.concat([
            new Uint8Array(allCollectedPieces),
            new Uint8Array(parsedPiece),
          ]);
        }

        pieceIndex++;
        pieceLen = piecesLength[pieceIndex];

        if (pieceIndex < piecesLength.length && pieceIndexToDownload === null) {
          requestPiece(socket, pieceLen, pieceIndex);
        } else {
          if (pieceIndexToDownload === null && saveToFilePath) {
            savePieceToFile(allCollectedPieces, saveToFilePath);
          }
          socket.end();
        }
      }
    } else if (messageId === 20) {
      console.log(message);
    }

    // OTHER MESSAGE TYPES
    else {
      console.log(`Received message with ID: ${messageId}`);
      // Handle other message types if needed
    }
  }
}
