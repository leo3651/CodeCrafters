import * as net from "net";
import fs from "fs";
import {
  generateHexHashFromBuffer,
  generateSha1UniqueId,
  generateTorrentInfoHashBuffer,
  getHexHashedPieces,
} from "./utils";

import type { Torrent } from "./model";

const BLOCK_SIZE = 16 * 1024;

export function createTcpConnection(
  peerIp: string,
  peerPort: string,
  torrent: Torrent,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null
) {
  const socket = net.createConnection(
    { host: peerIp, port: parseInt(peerPort) },
    () => {
      const handshake = createHandshake(
        generateTorrentInfoHashBuffer(torrent.info)
      );
      sendHandshake(socket, handshake);
    }
  );

  socket.once("data", (data) => {
    const peerId = data.slice(48, 68);
    console.log(`Peer ID: ${peerId.toString("hex")}`);

    sendInterested(socket);
    handlePeerMessages(
      socket,
      torrent.info["piece length"],
      torrent,
      saveToFilePath,
      pieceIndexToDownload
    );
  });

  socket.on("error", (err) => {
    console.error(err);
  });
}

function createHandshake(torrentInfoHashBuffer: Buffer) {
  const protocolNameUintArr = new Uint8Array(
    Buffer.from("BitTorrent protocol")
  );
  const protocolLenUintArr = new Uint8Array(
    Buffer.from([protocolNameUintArr.length])
  );
  const peerIdUintArr = new Uint8Array(Buffer.from(generateSha1UniqueId()));
  const torrentInfoHashBufferUintArr = new Uint8Array(torrentInfoHashBuffer);
  const reservedUint8 = new Uint8Array(Buffer.alloc(8));

  return Buffer.concat([
    protocolLenUintArr,
    protocolNameUintArr,
    reservedUint8,
    torrentInfoHashBufferUintArr,
    peerIdUintArr,
  ]);
}

function sendHandshake(socket: net.Socket, handshake: Buffer) {
  socket.write(new Uint8Array(handshake));
}

function handlePeerMessages(
  socket: net.Socket,
  pieceLen: number,
  torrent: Torrent,
  saveToFilePath: string | null,
  pieceIndexToDownload: number | null
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

      if (pieceIndex === 0 && saveToFilePath) {
        savePieceToFile(parsedPiece, saveToFilePath);
      }

      console.log(getHexHashedPieces(torrent.info.pieces));
      console.log(generateHexHashFromBuffer(parsedPiece));

      collectedPiece = Buffer.alloc(0);
      pieceIndex++;
      pieceLen = piecesLength[pieceIndex];

      if (pieceIndex < piecesLength.length && pieceIndexToDownload === null) {
        console.log("REQUEST PIECE");
        requestPiece(socket, pieceLen, pieceIndex);
      } else {
        socket.end();
      }
    }
  });
}

function sendInterested(socket: net.Socket) {
  const interestedMessage = Buffer.alloc(5);
  interestedMessage.writeUInt32BE(1, 0);
  interestedMessage.writeUInt8(2, 4);

  socket.write(new Uint8Array(interestedMessage));
  console.log("Send interested message");
}

function requestPiece(
  socket: net.Socket,
  pieceLen: number,
  pieceIndex: number
) {
  let offset = 0;

  while (offset < pieceLen) {
    const blockLen = Math.min(BLOCK_SIZE, pieceLen - offset);

    const requestMessage = Buffer.alloc(17);
    requestMessage.writeUInt32BE(13, 0);
    requestMessage.writeUint8(6, 4);
    requestMessage.writeUInt32BE(pieceIndex, 5);
    requestMessage.writeUInt32BE(offset, 9);
    requestMessage.writeUInt32BE(blockLen, 13);

    socket.write(new Uint8Array(requestMessage));
    console.log(
      `Requested block for piece index ${pieceIndex} at offset ${offset}`
    );

    offset += blockLen;
  }
}

export function savePieceToFile(pieceData: Buffer, outputPath: string) {
  try {
    fs.writeFileSync(outputPath, pieceData.toString("binary"), "binary");
    console.log("File saved");
  } catch (err) {
    console.error(err);
  }
}

function parsePiece(collectedPiece: Buffer) {
  let parsedPiece: number[] = [...collectedPiece];
  for (let i = 0; i < collectedPiece.length; i += BLOCK_SIZE) {
    console.log(parsedPiece.splice(i, 13));
  }
  return Buffer.from(parsedPiece);
}

function getPiecesLength(totalPiecesLen: number, pieceLen: number) {
  const numberOfFullLenPieces = Math.trunc(totalPiecesLen / pieceLen);
  const lastPieceLen = totalPiecesLen % pieceLen;

  const arr = new Array(numberOfFullLenPieces).fill(pieceLen);

  if (lastPieceLen > 0) {
    arr.push(lastPieceLen);
  }

  return arr;
}

function numberOfBlocksRequested(torrentLen: number) {
  return Math.ceil(torrentLen / BLOCK_SIZE);
}
