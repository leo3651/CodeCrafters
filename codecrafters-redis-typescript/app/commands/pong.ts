import * as net from "net";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";

export class Pong {
  public static exe(socket: net.Socket): void {
    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr([
        "REPLCONF",
        "listening-port",
        `${(socket as any).manualLocalPort}`,
      ]),
    );
    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr(["REPLCONF", "capa", "psync2"]),
    );
  }
}
