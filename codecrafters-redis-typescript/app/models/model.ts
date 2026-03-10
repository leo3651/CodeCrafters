import * as net from "net";
import { Subject, type Subscription } from "rxjs";

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
  Subscribe,
}

export enum EAddType {
  Prepend,
  Append,
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
  blockPopTimeout: Timer | null;
  listElAddedSubscription: Subscription | null;
  subscriptions: { [channelName: string]: Subscription };
}

export type Reply = Buffer | string;

export type TStream = [string, TStreamEntry[]];
export type TStreamEntry = [string, string[]];

export interface ChannelDict {
  [channelName: string]: Subject<string>;
}

export type SetMember = {
  name: string;
  score: number;
};
