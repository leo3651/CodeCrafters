import * as net from "net";
import { generateTorrentInfoHashBuffer } from "./utils";
import type { Torrent, TorrentInfo } from "./model";
import {
  createHandshakeBuffer,
  getPiecesLength,
  requestPiece,
  savePieceToFile,
  createInterestedBuffer,
} from "./helperTcpConnection";
import {
  createExtensionHandshakeBuffer,
  createReqExtMetadataBuffer,
  parseTorrentInfoFromExt,
} from "./magnetLinks";

let allCollectedPieces: Buffer = Buffer.alloc(0);
let collectedData: Buffer = Buffer.alloc(0);
let piecesLengthArr: number[] = [];
let pieceIndex: number = 0;
let pieceBlockOffset: number = 0;
let requestedExtensionMetadata: boolean = false;
let singlePieceIndexDownload: number | null = null;
let globalSaveToFilePath: string | null = null;

export function createTcpConnection(
  peerIp: string,
  peerPort: string,
  torrent: Torrent | null = null,
  saveToFilePath: string | null = null,
  pieceIndexToDownload: number | null = null,
  magnetHandshake: boolean = false,
  hexHashedInfoFromMagnetLink: string | null = null,
): void {
  singlePieceIndexDownload = pieceIndexToDownload;
  globalSaveToFilePath = saveToFilePath;
  let torrentInfoHashBuffer: Buffer;

  if (torrent) {
    torrentInfoHashBuffer = generateTorrentInfoHashBuffer(torrent.info);
    piecesLengthArr = getPiecesLength(
      torrent.info.length,
      torrent.info["piece length"],
    );
  } else if (hexHashedInfoFromMagnetLink) {
    torrentInfoHashBuffer = Buffer.from(hexHashedInfoFromMagnetLink, "hex");
  }

  const socket: net.Socket = net.createConnection(
    { host: peerIp, port: parseInt(peerPort) },
    () => {
      const handshake: Buffer = createHandshakeBuffer(
        torrentInfoHashBuffer,
        magnetHandshake,
      );
      socket.write(new Uint8Array(handshake));
    },
  );

  socket.on("data", (data) => {
    if (torrent) {
      handleBitTorrentMessages(data, socket, torrent);
    } else {
      handleBitTorrentMessages(data, socket);
    }
  });

  socket.on("error", (err) => {
    console.error(err);
    socket.end();
  });
}

function handleBitTorrentMessages(
  data: Buffer,
  socket: net.Socket,
  torrent: Torrent | null = null,
): void {
  // Append the new data to the buffer
  collectedData = Buffer.concat([
    new Uint8Array(collectedData),
    new Uint8Array(data),
  ]);

  if (
    collectedData[0] === 19 &&
    collectedData.subarray(1, 20).toString() === "BitTorrent protocol"
  ) {
    collectedData = Buffer.alloc(0);

    const peerId: Buffer = data.subarray(48, 68);
    console.log(`Peer ID: ${peerId.toString("hex")}`);

    if (data[25] === 16) {
      socket.write(createExtensionHandshakeBuffer());
    }

    if (torrent) {
      handleBitTorrentMessages(data.subarray(68), socket, torrent);
    } else {
      handleBitTorrentMessages(data.subarray(68), socket);
    }
    return;
  }

  // Process all complete messages in the buffer
  while (collectedData.length >= 4) {
    // Read the message length from the first 4 bytes
    const messageLen: number = collectedData.readInt32BE(0);

    // Check if the buffer contains the complete message
    if (collectedData.length < messageLen + 4) {
      // If not, wait for more data
      break;
    }

    // Extract the complete message
    const message: Buffer = collectedData.subarray(0, messageLen + 4);
    collectedData = collectedData.subarray(messageLen + 4); // Remove the processed message from the buffer

    const messageId: number = message.readUInt8(4);

    // UNCHOKE MESSAGE
    if (messageId === 1) {
      console.log("Received unchoke message");

      if (singlePieceIndexDownload !== null) {
        requestPiece(
          socket,
          piecesLengthArr[singlePieceIndexDownload],
          singlePieceIndexDownload,
        );
      } else {
        requestPiece(socket, piecesLengthArr[pieceIndex], pieceIndex);
      }
    }

    // BITFIELD MESSAGE
    else if (messageId === 5) {
      console.log("Received bitfield message");

      if (torrent) {
        socket.write(createInterestedBuffer());
        console.log("Send interested message");
      }
    }

    // PIECE BLOCK MESSAGE
    else if (messageId === 7) {
      console.log("Received block piece message");

      const pieceBlockData: Buffer = message.subarray(13);
      pieceBlockOffset += pieceBlockData.length;

      allCollectedPieces = Buffer.concat([
        new Uint8Array(allCollectedPieces),
        new Uint8Array(pieceBlockData),
      ]);

      if (
        singlePieceIndexDownload !== null &&
        pieceBlockOffset === piecesLengthArr[singlePieceIndexDownload]
      ) {
        savePieceToFile(allCollectedPieces, globalSaveToFilePath!);
        socket.end();
        return;
      } else {
        if (pieceBlockOffset === piecesLengthArr[pieceIndex]) {
          pieceBlockOffset = 0;
          pieceIndex++;

          if (pieceIndex < piecesLengthArr.length) {
            requestPiece(socket, piecesLengthArr[pieceIndex], pieceIndex);
          } else {
            savePieceToFile(allCollectedPieces, globalSaveToFilePath!);

            socket.end();
          }
        }
      }
    }

    // EXTENSION HANDSHAKE
    else if (messageId === 20) {
      console.log("Received extension message");

      if (!requestedExtensionMetadata) {
        socket.write(createReqExtMetadataBuffer(message));
        requestedExtensionMetadata = true;

        if (process.argv[2] === "magnet_handshake") {
          socket.end();
        }
      }

      // ext handshake received
      else {
        const torrentInfo: TorrentInfo = parseTorrentInfoFromExt(message);
        piecesLengthArr = getPiecesLength(
          torrentInfo.length,
          torrentInfo["piece length"],
        );

        if (
          process.argv[2] === "magnet_download_piece" ||
          process.argv[2] === "magnet_download"
        ) {
          socket.write(createInterestedBuffer());
        }

        if (process.argv[2] === "magnet_info") {
          socket.end();
        }
      }
    }
  }
}
