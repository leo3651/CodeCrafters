import * as net from "net";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { socketsInfo } from "../socketsInfo";
import { ExecutionType } from "../models/model";

export class Ping {
  public static exe(socket: net.Socket) {
    if (socketsInfo.getInfo(socket).executionType === ExecutionType.Subscribe) {
      socket.write(redisProtocolEncoder.encodeRespArr(["pong", ""]));
    } else {
      Response.handle(socket, redisProtocolEncoder.encodeSimpleString("PONG"));
    }
  }
}
