import * as net from "net";
import { socketsInfo } from "./socketsInfo";
import { ExecutionType } from "./models/model";

export class Response {
  public static handle(socket: net.Socket, message: string | Buffer): void {
    if (socketsInfo.getInfo(socket).isReplica && !message.includes("ACK")) {
      return;
    }

    if (socketsInfo.getInfo(socket).executionType === ExecutionType.Exec) {
      socketsInfo.getInfo(socket).queuedReplies.push(message);
    } else {
      socket.write(message);
    }
  }
}
