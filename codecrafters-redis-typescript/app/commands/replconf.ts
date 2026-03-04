import * as net from "net";
import { Response } from "../response";
import { socketsInfo } from "../socketsInfo";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";

export class ReplConf {
  public static exe(socket: net.Socket, command: string[]) {
    if (command[1] === "GETACK") {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeRespArr([
          "REPLCONF",
          "ACK",
          `${socketsInfo.getInfo(socket).processedBytes}`,
        ]),
      );
    } else if (command[1] === "ACK") {
      socketsInfo.getInfo(socket).processedBytes = Number.parseInt(command[2]);
      socketsInfo.getInfo(socket).propagatedBytes +=
        redisProtocolEncoder.encodeRespArr(["REPLCONF", "GETACK", "*"]).length;
    } else {
      Response.handle(socket, redisProtocolEncoder.encodeSimpleString("OK"));
    }
  }
}
