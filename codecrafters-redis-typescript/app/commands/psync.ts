import * as net from "net";
import { InfoGenerator } from "../handlers/infoGenerator";
import { Response } from "../response";
import { socketsInfo } from "../socketsInfo";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { redisFile } from "../protocol/redisFile";

export class Psync {
  public static exe(socket: net.Socket): void {
    Response.handle(
      socket,
      redisProtocolEncoder.encodeSimpleString(
        `FULLRESYNC ${InfoGenerator.info.master_replid} ${InfoGenerator.info.master_repl_offset}`,
      ),
    );
    Response.handle(socket, redisFile.getEmptyRdbFileBuffer());
    socketsInfo.getInfo(socket).isReplica = true;
  }
}
