export type IDecodedValue = string | number | DecodedDict | IDecodedValue[];

export interface DecodedDict {
  [key: string]: IDecodedValue;
}

export interface Torrent extends DecodedDict {
  announce: string;
  "created by": string;
  info: TorrentInfo;
}

export interface TorrentInfo extends DecodedDict {
  length: number;
  name: string;
  "piece length": number;
  pieces: string;
}

export interface IDiscoverPeersParams {
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
