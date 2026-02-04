import * as net from "net";
import fs from "fs";

import { generateHexHashUniqueId } from "./utils";

const BLOCK_SIZE = 16 * 1024;

export function createHandshakeBuffer(
  torrentInfoHashBuffer: Buffer,
  magnetLink: boolean,
): Buffer {
  const protocolNameUintArr: Uint8Array = new Uint8Array(
    Buffer.from("BitTorrent protocol"),
  );
  const protocolNameLenUintArr: Uint8Array = new Uint8Array(
    Buffer.from([protocolNameUintArr.length]),
  );
  const peerIdUintArr: Uint8Array = new Uint8Array(
    Buffer.from(generateHexHashUniqueId()),
  );
  const torrentInfoHashBufferUintArr: Uint8Array = new Uint8Array(
    torrentInfoHashBuffer,
  );
  const reservedUint8: Uint8Array = new Uint8Array(
    Buffer.from([0, 0, 0, 0, 0, magnetLink ? 16 : 0, 0, 0]),
  );

  return Buffer.concat([
    protocolNameLenUintArr,
    protocolNameUintArr,
    reservedUint8,
    torrentInfoHashBufferUintArr,
    peerIdUintArr,
  ]);
}

export function createInterestedBuffer(): Uint8Array {
  const interestedMessage: Buffer = Buffer.alloc(5);
  interestedMessage.writeUInt32BE(1, 0);
  interestedMessage.writeUInt8(2, 4);

  return new Uint8Array(interestedMessage);
}

export function requestPiece(
  socket: net.Socket,
  pieceLen: number,
  pieceIndex: number,
): void {
  let offset: number = 0;

  while (offset < pieceLen) {
    const blockLen: number = Math.min(BLOCK_SIZE, pieceLen - offset);

    const requestMessage: Buffer = Buffer.alloc(17);

    requestMessage.writeUInt32BE(13, 0);
    requestMessage.writeUint8(6, 4);
    requestMessage.writeUInt32BE(pieceIndex, 5);
    requestMessage.writeUInt32BE(offset, 9);
    requestMessage.writeUInt32BE(blockLen, 13);

    socket.write(new Uint8Array(requestMessage));
    console.log(
      `Requested block for piece index ${pieceIndex} at offset ${offset}`,
    );

    offset += blockLen;
  }
}

export function savePieceToFile(pieceData: Buffer, outputPath: string): void {
  try {
    fs.writeFileSync(outputPath, pieceData.toString("binary"), "binary");
    console.log("File saved");
  } catch (err) {
    console.error(err);
  }
}

export function getPiecesLength(
  totalPiecesLen: number,
  pieceLen: number,
): number[] {
  const numberOfFullLenPieces: number = Math.trunc(totalPiecesLen / pieceLen);
  const lastPieceLen: number = totalPiecesLen % pieceLen;

  const arr: number[] = new Array(numberOfFullLenPieces).fill(pieceLen);

  if (lastPieceLen > 0) {
    arr.push(lastPieceLen);
  }

  return arr;
}
