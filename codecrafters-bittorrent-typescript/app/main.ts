import { decodeBencode } from "./decodeBencode";
import {
  generateTorrentInfoHashBuffer,
  getHexHashedPieces,
  parseTorrentObject,
} from "./utils";
import { createTcpConnection } from "./tcpConnection";
import { discoverPeers } from "./discoverPeers";
import { parseMagnetLink } from "./magnetLinks";
import type { IDecodedValue, MagnetLink, Torrent } from "./model";

const args: string[] = process.argv;

// Arg DECODE
if (args[2] === "decode") {
  try {
    const bencodedValue: string = args[3];
    const [decoded]: [IDecodedValue, number] = decodeBencode(bencodedValue);

    console.log(JSON.stringify(decoded));
  } catch (error: any) {
    console.error(error.message);
  }
}

// Arg INFO
else if (args[2] === "info") {
  const torrentFile: string = args[3];
  const torrent: Torrent = parseTorrentObject(torrentFile);
  if (!torrent.announce || !torrent.info) {
    throw new Error("Invalid torrent file");
  }

  console.log(
    `Tracker URL: ${torrent.announce}\nLength: ${torrent.info.length}`,
  );

  const torrentInfoHashBuffer: Buffer = generateTorrentInfoHashBuffer(
    torrent.info,
  );

  console.log(`Info Hash: ${torrentInfoHashBuffer.toString("hex")}`);
  console.log(`Piece Length: ${torrent.info["piece length"]}`);

  const hexHashedPieces: string[] = getHexHashedPieces(torrent.info.pieces);
  console.log("Piece Hashes:");
  hexHashedPieces.forEach((element: string) => {
    console.log(element);
  });
}

// Arg PEERS
else if (args[2] === "peers") {
  const torrent: Torrent = parseTorrentObject(args[3]);
  const peers: string[] = await discoverPeers(torrent.announce, torrent, null);

  peers.forEach((peer: string) => console.log(peer));
}

// Arg HANDSHAKE
else if (args[2] === "handshake") {
  const peer: string = args[4];
  const torrentFile: string = args[3];
  const torrent: Torrent = parseTorrentObject(torrentFile);
  const [peerIp, peerPort]: string[] = peer.split(":");

  createTcpConnection(peerIp, peerPort, torrent);
}

// Arg DOWNLOAD_PIECE || DOWNLOAD
else if (args[2] === "download_piece" || args[2] === "download") {
  const torrentFile: string = args[5];
  const saveToFilePath: string = args[4];
  const pieceIndexToDownload: number | null = isNaN(parseInt(args[6]))
    ? null
    : parseInt(args[6]);
  const torrent: Torrent = parseTorrentObject(torrentFile);

  discoverPeers(torrent.announce, torrent, null).then((peers: string[]) => {
    const [peerIp, peerPort]: string[] = peers[0].split(":");
    createTcpConnection(
      peerIp,
      peerPort,
      torrent,
      saveToFilePath,
      pieceIndexToDownload,
    );
  });
}

// Arg MAGNET_PARSE
else if (args[2] === "magnet_parse") {
  const magnetLink: string = args[3];
  const magnetLinkObj: MagnetLink = parseMagnetLink(magnetLink);
  console.log(`Tracker URL: ${magnetLinkObj.tr}`);
  console.log(`Info Hash: ${magnetLinkObj.xt}`);
}

// Arg MAGNET_HANSHAKE || MAGNET_INFO
else if (args[2] === "magnet_handshake" || args[2] === "magnet_info") {
  const magnetLink: string = args[3];
  const magnetLinkObj: MagnetLink = parseMagnetLink(magnetLink);
  console.log(`Tracker URL: ${magnetLinkObj.tr}`);
  console.log(`Info Hash: ${magnetLinkObj.xt}`);

  discoverPeers(magnetLinkObj.tr, null, magnetLinkObj.xt).then(
    (peers: string[]) => {
      const [peerIp, peerPort]: string[] = peers[0].split(":");
      createTcpConnection(
        peerIp,
        peerPort,
        null,
        null,
        null,
        true,
        magnetLinkObj.xt,
      );
    },
  );
}

// Arg MAGNET_DOWNLOAD_PIECE || MAGNET_DOWNLOAD
else if (args[2] === "magnet_download_piece" || args[2] === "magnet_download") {
  const saveToFilePath: string = args[4];
  const magnetLink: string = args[5];
  const pieceIndexToDownload: number | null = isNaN(parseInt(args[6]))
    ? null
    : parseInt(args[6]);
  const magnetLinkObj: MagnetLink = parseMagnetLink(magnetLink);

  discoverPeers(magnetLinkObj.tr, null, magnetLinkObj.xt).then(
    (peers: string[]) => {
      const [peerIp, peerPort] = peers[0].split(":");
      createTcpConnection(
        peerIp,
        peerPort,
        null,
        saveToFilePath,
        pieceIndexToDownload,
        true,
        magnetLinkObj.xt,
      );
    },
  );
}
