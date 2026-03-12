import * as net from "net";
import { socketsInfo } from "./socketsInfo";
import { ExecutionType, type SocketInfo } from "./models/model";
import { Response } from "./response";
import { InfoGenerator } from "./handlers/infoGenerator";
import { Transactions } from "./handlers/transactions";
import { list } from "./handlers/list";
import { channelHandler } from "./handlers/channel";
import { Pong } from "./commands/pong";
import { ReplConf } from "./commands/replconf";
import { Ok } from "./commands/ok";
import { Psync } from "./commands/psync";
import { redisProtocolEncoder } from "./protocol/redisProtocolEncoder";
import { Dictionary } from "./handlers/dictionary";
import { redisFile } from "./protocol/redisFile";
import { Wait } from "./commands/wait";
import { Type } from "./commands/type";
import { streams } from "./handlers/streams";
import { Ping } from "./commands/ping";
import { set } from "./handlers/set";
import { geo } from "./handlers/geo";
import { authentication } from "./handlers/authtentication";

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
      if (
        socketsInfo.getInfo(socket).executionType === ExecutionType.Subscribe
      ) {
        if (
          !channelHandler.subscribedModeCmds.includes(command[0].toLowerCase())
        ) {
          socket.write(
            redisProtocolEncoder.encodeSimpleError(
              `ERR Can't execute '${command[0]}': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`,
            ),
          );
          return;
        }
      }

      switch (command[0].toLowerCase()) {
        case "echo":
          const echo: string = command[1];
          Response.handle(socket, redisProtocolEncoder.encodeBulkString(echo));
          break;

        case "ping":
          Ping.exe(socket);
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
          Pong.exe(socket);
          break;

        case "ok":
          Ok.exe(socket);
          break;

        case "replconf":
          ReplConf.exe(socket, command);
          break;

        case "psync":
          Psync.exe(socket);
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

        case "lrange":
          list.lRange(socket, command);
          break;

        case "lpush":
          list.lPush(socket, command);
          break;

        case "llen":
          list.lLen(socket, command);
          break;

        case "lpop":
          list.lPop(socket, command);
          break;

        case "blpop":
          list.blPop(socket, command);
          break;

        case "subscribe":
          channelHandler.subscribe(socket, command);
          break;

        case "publish":
          channelHandler.publish(socket, command);
          break;

        case "unsubscribe":
          channelHandler.unsubscribe(socket, command);
          break;

        case "zadd":
          set.zAdd(socket, command);
          break;

        case "zrank":
          set.zRank(socket, command);
          break;

        case "zrange":
          set.zRange(socket, command);
          break;

        case "zcard":
          set.zCard(socket, command);
          break;

        case "zscore":
          set.zScore(socket, command);
          break;

        case "zrem":
          set.zRem(socket, command);
          break;

        case "geoadd":
          geo.geoAdd(socket, command);
          break;

        case "geopos":
          geo.geoPos(socket, command);
          break;

        case "geodist":
          geo.geoDist(socket, command);
          break;

        case "geosearch":
          geo.geoSearch(socket, command);
          break;

        case "acl":
          authentication.acl(socket, command);
          break;

        case "auth":
          authentication.auth(socket, command);
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
        .filter((socketInfo: SocketInfo) => socketInfo.isReplica)
        .forEach((socketInfo: SocketInfo) => {
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
