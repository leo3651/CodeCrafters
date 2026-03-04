import * as net from "net";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { socketsInfo } from "../socketsInfo";
import { EExecutionType } from "../models/model";

export class Ping {
  public static exe(socket: net.Socket) {
    if (
      socketsInfo.getInfo(socket).executionType === EExecutionType.Subscribe
    ) {
      socket.write(redisProtocolEncoder.encodeRespArr(["pong", ""]));
    } else {
      Response.handle(socket, redisProtocolEncoder.encodeSimpleString("PONG"));
    }
  }
}
