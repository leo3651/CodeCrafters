import * as net from "net";
import { Subject, type Subscription } from "rxjs";

export enum OpCode {
  EOF = 0xff,
  SELECTDB = 0xfe,
  EXPIRE_TIME_SEC = 0xfd,
  EXPIRE_TIME_MS = 0xfc,
  RESIZE_DB = 0xfb,
  AUX = 0xfa,
}

export enum ExecutionType {
  Multi,
  Exec,
  Regular,
  Subscribe,
}

export enum AddType {
  Prepend,
  Append,
}

export interface Info {
  role: string;
  master_replid: string;
  master_repl_offset: number;
}

export interface SocketInfo {
  socket: net.Socket;
  propagatedBytes: number;
  processedBytes: number;
  numberOfResponses: number;
  queuedCommands: string[][];
  queuedReplies: Reply[];
  isReplica: boolean;
  executionType: ExecutionType;
  blockPopTimeout: Timer | null;
  listElAddedSubscription: Subscription | null;
  subscriptions: { [channelName: string]: Subscription };
  isAuthenticated: boolean;
  userName: string;
}

export type Reply = Buffer | string;

export type Stream = [string, StreamEntry[]];
export type StreamEntry = [string, string[]];

export type SetMember = {
  name: string;
  score: string;
};

export enum Coordinates {
  Longitude,
  Latitude,
}

export type User = {
  flags: Set<string>;
  passwords: Set<string>;
};
