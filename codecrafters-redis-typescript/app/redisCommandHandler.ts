import * as net from "net";
import { redisProtocolEncoder } from "./redisProtocolEncoder";
import { redisFile } from "./redisFile";
import { socketsInfo } from "./socketsInfo";
import { type ISocketInfo } from "./model";
import { Response } from "./response";
import { streams } from "./streams";
import { Dictionary } from "./dictionary";
import { Wait } from "./wait";
import { Type } from "./type";
import { InfoGenerator } from "./infoGenerator";
import { Transactions } from "./transactions";
import { list } from "./list";

class RedisCommandHandler {
  public processCommands(commands: string[][], socket: net.Socket): void {
    for (const command of commands) {
      this.processCommand(command, socket);
    }
  }

  private processCommand(command: string[], socket: net.Socket): void {
    if (Transactions.cmdRanUnderMulti(socket, command)) {
      Transactions.queueCommand(socket, command);
    } else {
      switch (command[0].toLowerCase()) {
        case "echo":
          const echo: string = command[1];
          Response.handle(socket, redisProtocolEncoder.encodeBulkString(echo));
          break;

        case "ping":
          Response.handle(
            socket,
            redisProtocolEncoder.encodeSimpleString("PONG"),
          );
          break;

        case "set":
          Dictionary.set(command);
          Response.handle(
            socket,
            redisProtocolEncoder.encodeSimpleString("OK"),
          );
          break;

        case "get":
          Response.handle(
            socket,
            redisProtocolEncoder.encodeBulkString(Dictionary.get(command)),
          );
          break;

        case "keys":
          Response.handle(
            socket,
            redisProtocolEncoder.encodeRespArr(Dictionary.keys(command)),
          );
          break;

        case "config":
          Response.handle(
            socket,
            redisProtocolEncoder.encodeRespArr([
              command[2],
              command[2] === "dir" ? redisFile.dir : redisFile.dbFileName,
            ]),
          );

          break;

        case "info":
          Response.handle(
            socket,
            redisProtocolEncoder.encodeBulkString(InfoGenerator.generate()),
          );
          break;

        case "pong":
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
          break;

        case "ok":
          socketsInfo.getInfo(socket).numberOfResponses++;

          if (socketsInfo.getInfo(socket).numberOfResponses === 2) {
            Response.handle(
              socket,
              redisProtocolEncoder.encodeRespArr(["PSYNC", "?", "-1"]),
            );
            socketsInfo.getInfo(socket).isReplica = true;
          }
          break;

        case "replconf":
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
            socketsInfo.getInfo(socket).processedBytes = Number.parseInt(
              command[2],
            );
            socketsInfo.getInfo(socket).propagatedBytes +=
              redisProtocolEncoder.encodeRespArr([
                "REPLCONF",
                "GETACK",
                "*",
              ]).length;
          } else {
            Response.handle(
              socket,
              redisProtocolEncoder.encodeSimpleString("OK"),
            );
          }
          break;

        case "psync":
          Response.handle(
            socket,
            redisProtocolEncoder.encodeSimpleString(
              `FULLRESYNC ${InfoGenerator.info.master_replid} ${InfoGenerator.info.master_repl_offset}`,
            ),
          );
          Response.handle(socket, redisFile.getEmptyRdbFileBuffer());
          socketsInfo.getInfo(socket).isReplica = true;

          break;

        case "wait":
          Wait.exe(socket, command);
          break;

        case "type":
          Type.exe(socket, command);
          break;

        case "xadd":
          streams.xAdd(socket, command);
          break;

        case "xrange":
          streams.xRange(socket, command);
          break;

        case "xread":
          streams.xRead(socket, command);
          break;

        case "incr":
          Dictionary.incr(socket, command);
          break;

        case "multi":
          Transactions.multi(socket);
          break;

        case "exec":
          Transactions.exec(socket, this.processCommand.bind(this));
          break;

        case "discard":
          Transactions.discard(socket);
          break;

        case "rpush":
          list.rPush(socket, command);
          break;

        default:
          if (
            command[0].startsWith("FULLRESYNC") ||
            command[0].startsWith("REDIS0011")
          ) {
          } else {
            throw new Error(`Unhandled REDIS command ${command}`);
          }
      }

      if (socketsInfo.getInfo(socket).isReplica) {
        this.processReplicaCommand(socket, command);
      } else {
        this.propagateCommand(command);
      }
    }
  }

  private propagateCommand(command: string[]): void {
    const writeCommands: string[] = ["set"];

    if (writeCommands.includes(command[0].toLowerCase())) {
      socketsInfo.sockets
        .filter((socketInfo: ISocketInfo) => socketInfo.isReplica)
        .forEach((socketInfo: ISocketInfo) => {
          const respEncodedCommand: string =
            redisProtocolEncoder.encodeRespArr(command);
          socketInfo.socket.write(respEncodedCommand);
          socketInfo.propagatedBytes += respEncodedCommand.length;
        });
    }
  }

  private processReplicaCommand(socket: net.Socket, command: string[]): void {
    const replicaCommands: string[] = ["ping", "set"];

    if (
      replicaCommands.includes(command[0].toLowerCase()) ||
      (command[0].toLowerCase() === "replconf" &&
        command[1].toLowerCase() === "getack")
    ) {
      const processedBytes: number =
        redisProtocolEncoder.encodeRespArr(command).length;
      socketsInfo.getInfo(socket).processedBytes += processedBytes;
    }
  }
}

const redisCommandHandler: RedisCommandHandler = new RedisCommandHandler();
export { redisCommandHandler };
