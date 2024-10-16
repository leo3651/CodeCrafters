import * as net from "net";
import { generateSha1UniqueId } from "./utils";

export function createTcpConnection(
  peerIp: string,
  peerPort: string,
  torrentInfoHashBuffer: Buffer
) {
  const socket = net.createConnection(
    { host: peerIp, port: parseInt(peerPort) },
    () => {
      sendHandshake(socket, createHandshake(torrentInfoHashBuffer));
    }
  );

  socket.on("error", (err) => {
    console.error(err);
  });
}

export function createHandshake(torrentInfoHashBuffer: Buffer) {
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

export function sendHandshake(socket: net.Socket, handshake: Buffer) {
  socket.write(new Uint8Array(handshake));

  socket.once("data", (data: Buffer) => {
    const peerId = data.slice(48, 68);
    console.log(`Peer ID: ${peerId.toString("hex")}`);
    //socket.end(() => {});
    const messageLength = data.readUInt32BE(0); // Read the message length
    const messageId = data.readUInt8(4); // Read the message ID

    if (messageId === 5) {
      console.log("Received Bitfield message");
    }
  });

  socket.on("error", (err) => {
    console.log(err);
  });
}

export function sendInterested(socket: net.Socket) {
  const interestedMessage = Buffer.alloc(5);
  interestedMessage.writeUInt32BE(1, 0);
  interestedMessage.writeUInt8(2, 4);

  socket.write(new Uint8Array(interestedMessage));
  console.log("Send interested message");
}
