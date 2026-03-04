import * as net from "net";
import { Dictionary } from "../handlers/dictionary";
import { streams } from "../handlers/streams";
import type { TStream } from "../models/model";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";

export class Type {
  public static exe(socket: net.Socket, command: string[]): void {
    const key: string = command[1];
    const value: string = Dictionary.getValue(key);
    const stream: TStream | null = streams.getStream(key);

    if (value) {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeSimpleString(typeof value),
      );
    } else if (stream) {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeSimpleString("stream"),
      );
    } else {
      Response.handle(socket, redisProtocolEncoder.encodeSimpleString("none"));
    }
  }
}
