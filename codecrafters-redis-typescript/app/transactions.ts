import { redisProtocolEncoder } from "./redisProtocolEncoder";
import { Response } from "./response";
import * as net from "net";
import { socketsInfo } from "./socketsInfo";
import { EExecutionType } from "./model";

export class Transactions {
  public static multi(socket: net.Socket): void {
    socketsInfo.getInfo(socket).executionType = EExecutionType.Multi;
    Response.handle(socket, redisProtocolEncoder.encodeSimpleString("OK"));
  }

  public static exec(
    socket: net.Socket,
    processCommandCb: (command: string[], socket: net.Socket) => void,
  ): void {
    // Can not call exec without previously calling multi
    if (socketsInfo.getInfo(socket).executionType !== EExecutionType.Multi) {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeSimpleError("ERR EXEC without MULTI"),
      );
    }

    // Exec
    else {
      socketsInfo.getInfo(socket).executionType = EExecutionType.Exec;

      socketsInfo.getInfo(socket).queuedCommands.forEach((queuedCommand) => {
        processCommandCb(queuedCommand, socket);
      });

      socketsInfo.getInfo(socket).executionType = EExecutionType.Regular;

      Response.handle(
        socket,
        `*${
          socketsInfo.getInfo(socket).queuedReplies.length
        }\r\n${socketsInfo.getInfo(socket).queuedReplies.join("")}`,
      );
    }
  }

  public static discard(socket: net.Socket): void {
    if (socketsInfo.getInfo(socket).executionType === EExecutionType.Multi) {
      socketsInfo.getInfo(socket).queuedCommands = [];
      socketsInfo.getInfo(socket).executionType = EExecutionType.Regular;
      Response.handle(socket, redisProtocolEncoder.encodeSimpleString("OK"));
    } else {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeSimpleError("ERR DISCARD without MULTI"),
      );
    }
  }

  public static queueCommand(socket: net.Socket, command: string[]): void {
    socketsInfo.getInfo(socket).queuedCommands.push(command);
    Response.handle(socket, redisProtocolEncoder.encodeSimpleString("QUEUED"));
  }

  public static cmdRanUnderMulti(
    socket: net.Socket,
    command: string[],
  ): boolean {
    return (
      socketsInfo.getInfo(socket).executionType === EExecutionType.Multi &&
      command[0] !== "EXEC" &&
      command[0] !== "DISCARD"
    );
  }
}
