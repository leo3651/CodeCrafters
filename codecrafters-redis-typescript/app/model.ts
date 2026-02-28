import * as net from "net";

export enum EOpCode {
  EOF = 0xff,
  SELECTDB = 0xfe,
  EXPIRE_TIME_SEC = 0xfd,
  EXPIRE_TIME_MS = 0xfc,
  RESIZE_DB = 0xfb,
  AUX = 0xfa,
}

export enum EExecutionType {
  Multi,
  Exec,
  Regular,
}

export interface IInfo {
  role: string;
  master_replid: string;
  master_repl_offset: number;
}

export interface ISocketInfo {
  socket: net.Socket;
  propagatedBytes: number;
  processedBytes: number;
  numberOfResponses: number;
  queuedCommands: string[][];
  queuedReplies: Reply[];
  isReplica: boolean;
  executionType: EExecutionType;
}

export type Reply = Buffer | string;

export type TStream = [string, TStreamEntry[]];
export type TStreamEntry = [string, string[]];
