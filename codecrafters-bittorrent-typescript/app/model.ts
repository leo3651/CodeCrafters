export type BencodedValue =
  | string
  | number
  | DecodedDict
  | BencodedValue[]
  | Torrent;

export interface DecodedDict {
  [key: string]: BencodedValue;
}

export interface Torrent {
  announce: string;
  "created by": string;
  info: TorrentInfo;
}
export interface TorrentInfo {
  length: number;
  name: string;
  "piece length": number;
  pieces: string;
}

export interface ParamsDiscoverPeers {
  peer_id: string;
  port: number;
  uploaded: number;
  downloaded: number;
  left: number;
  compact: number;
}

export interface MagnetLink {
  [key: string]: string;
  xt: string;
  dn: string;
  tr: string;
}
