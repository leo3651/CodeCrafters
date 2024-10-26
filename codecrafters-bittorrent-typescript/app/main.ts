import { decodeBencode } from "./decodeBencode";
import {
  generateTorrentInfoHashBuffer,
  getHexHashedPieces,
  parseTorrentObject,
} from "./utils";
import { createTcpConnection } from "./tcpConnection";
import { discoverPeers } from "./discoverPeers";
import { parseMagnetLink } from "./magnetLinks";
import type { MagnetLink } from "./model";

const args = process.argv;

// Arg DECODE
if (args[2] === "decode") {
  try {
    const bencodedValue = args[3];
    const [decoded, _] = decodeBencode(bencodedValue);
    console.log(JSON.stringify(decoded));
  } catch (error: any) {
    console.error(error.message);
  }
}

// Arg INFO
else if (args[2] === "info") {
  const torrentFile = args[3];
  const torrent = parseTorrentObject(torrentFile);
  if (!torrent.announce || !torrent.info) {
    throw new Error("Invalid torrent file");
  }

  console.log(
    `Tracker URL: ${torrent.announce}\nLength: ${torrent.info.length}`
  );

  const torrentInfoHashBuffer = generateTorrentInfoHashBuffer(torrent.info);

  console.log(`Info Hash: ${torrentInfoHashBuffer.toString("hex")}`);
  console.log(`Piece Length: ${torrent.info["piece length"]}`);

  const hexHashedPieces = getHexHashedPieces(torrent.info.pieces);
  console.log("Piece Hashes:");
  hexHashedPieces.forEach((element) => {
    console.log(element);
  });
}

// Arg PEERS
else if (args[2] === "peers") {
  const torrent = parseTorrentObject(args[3]);
  discoverPeers(torrent.announce, torrent);
}

// Arg HANDSHAKE
else if (args[2] === "handshake") {
  const peer = args[4];
  const torrentFile = args[3];
  const torrent = parseTorrentObject(torrentFile);
  const [peerIp, peerPort] = peer.split(":");
  createTcpConnection(peerIp, peerPort, torrent);
}

// Arg DOWNLOAD_PIECE || DOWNLOAD
else if (args[2] === "download_piece" || args[2] === "download") {
  const torrentFile = args[5];
  const saveToFilePath = args[4];
  const pieceIndexToDownload: number | null = isNaN(parseInt(args[6]))
    ? null
    : parseInt(args[6]);
  const torrent = parseTorrentObject(torrentFile);

  discoverPeers(torrent.announce, torrent).then((peers) => {
    const [peerIp, peerPort] = peers[0].split(":");
    createTcpConnection(
      peerIp,
      peerPort,
      torrent,
      saveToFilePath,
      pieceIndexToDownload
    );
  });
}

// Arg MAGNET_PARSE
else if (args[2] === "magnet_parse") {
  const magnetLink = args[3];
  parseMagnetLink(magnetLink);
}

// Arg MAGNET_HANSHAKE || MAGNET_INFO
else if (args[2] === "magnet_handshake" || args[2] === "magnet_info") {
  const magnetLink = args[3];
  const magnetLinkObj: MagnetLink = parseMagnetLink(magnetLink);
  discoverPeers(magnetLinkObj.tr, null, magnetLinkObj.xt).then((peers) => {
    const [peerIp, peerPort] = peers[0].split(":");
    createTcpConnection(
      peerIp,
      peerPort,
      null,
      null,
      null,
      true,
      magnetLinkObj.xt
    );
  });
}

// Arg MAGNET_DOWNLOAD_PIECE || MAGNET_DOWNLOAD
else if (args[2] === "magnet_download_piece" || args[2] === "magnet_download") {
  console.log(args);
  const saveToFilePath = args[4];
  const magnetLink = args[5];
  const pieceIndexToDownload: number | null = isNaN(parseInt(args[6]))
    ? null
    : parseInt(args[6]);

  const magnetLinkObj: MagnetLink = parseMagnetLink(magnetLink);
  discoverPeers(magnetLinkObj.tr, null, magnetLinkObj.xt).then((peers) => {
    const [peerIp, peerPort] = peers[0].split(":");
    createTcpConnection(
      peerIp,
      peerPort,
      null,
      saveToFilePath,
      pieceIndexToDownload,
      true,
      magnetLinkObj.xt
    );
  });
}
