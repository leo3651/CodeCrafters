import * as net from "net";
import fs from "fs";

import { generateSha1UniqueId } from "./utils";

const BLOCK_SIZE = 16 * 1024;

export function createHandshake(
  torrentInfoHashBuffer: Buffer,
  magnetLink: boolean = false
) {
  const protocolNameUintArr = new Uint8Array(
    Buffer.from("BitTorrent protocol")
  );
  const protocolLenUintArr = new Uint8Array(
    Buffer.from([protocolNameUintArr.length])
  );
  const peerIdUintArr = new Uint8Array(Buffer.from(generateSha1UniqueId()));
  const torrentInfoHashBufferUintArr = new Uint8Array(torrentInfoHashBuffer);
  const reservedUint8 = new Uint8Array(
    Buffer.from([0, 0, 0, 0, 0, magnetLink ? 16 : 0, 0, 0])
  );

  return Buffer.concat([
    protocolLenUintArr,
    protocolNameUintArr,
    reservedUint8,
    torrentInfoHashBufferUintArr,
    peerIdUintArr,
  ]);
}

export function sendHandshake(socket: net.Socket, handshake: Buffer) {
  socket.write(new Uint8Array(handshake));
}

export function sendInterested(socket: net.Socket) {
  const interestedMessage = Buffer.alloc(5);
  interestedMessage.writeUInt32BE(1, 0);
  interestedMessage.writeUInt8(2, 4);

  socket.write(new Uint8Array(interestedMessage));
  console.log("Send interested message");
}

export function requestPiece(
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

export function getPiecesLength(totalPiecesLen: number, pieceLen: number) {
  const numberOfFullLenPieces = Math.trunc(totalPiecesLen / pieceLen);
  const lastPieceLen = totalPiecesLen % pieceLen;

  const arr = new Array(numberOfFullLenPieces).fill(pieceLen);

  if (lastPieceLen > 0) {
    arr.push(lastPieceLen);
  }

  return arr;
}
