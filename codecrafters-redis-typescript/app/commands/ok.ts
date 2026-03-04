import { Response } from "../response";
import * as net from "net";
import { socketsInfo } from "../socketsInfo";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";

export class Ok {
  public static exe(socket: net.Socket) {
    socketsInfo.getInfo(socket).numberOfResponses++;

    if (socketsInfo.getInfo(socket).numberOfResponses === 2) {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeRespArr(["PSYNC", "?", "-1"]),
      );
      socketsInfo.getInfo(socket).isReplica = true;
    }
  }
}
