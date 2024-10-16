import { decodeBencode } from "./decodeBencode";
import {
  generateTorrentInfoHashBuffer,
  getHexHashedPieces,
  parseTorrentObject,
  urlEncodeBinary,
} from "./utils";
import { createTcpConnection } from "./tcpConnection";
import { discoverPeers } from "./discoverPeers";

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
  const torrentInfoHashBuffer = generateTorrentInfoHashBuffer(torrent.info);
  const urlEncodedInfoHash = urlEncodeBinary(torrentInfoHashBuffer);

  discoverPeers(torrent.announce, urlEncodedInfoHash, torrent.info.length);
}

// Arg HANDSHAKE
else if (args[2] === "handshake") {
  const torrentFile = args[3];
  const torrent = parseTorrentObject(torrentFile);
  const [peerIp, peerPort] = args[4].split(":");
  createTcpConnection(
    peerIp,
    peerPort,
    generateTorrentInfoHashBuffer(torrent.info)
  );
}

// Arg DOWNLOAD_PIECE
else if ((args[2] = "download_piece")) {
  const torrentFile = args[5];
  const torrent = parseTorrentObject(torrentFile);
  const torrentInfoHashBuffer = generateTorrentInfoHashBuffer(torrent.info);
  const urlEncodedInfoHash = urlEncodeBinary(torrentInfoHashBuffer);

  discoverPeers(torrent.announce, urlEncodedInfoHash, torrent.info.length).then(
    (peers) => {
      const [peerIp, peerPort] = peers[0].split(":");
      createTcpConnection(
        peerIp,
        peerPort,
        generateTorrentInfoHashBuffer(torrent.info)
      );
    }
  );
}
