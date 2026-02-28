import * as net from "net";
import { redisProtocolEncoder } from "./redisProtocolEncoder";
import { redisCommandHandler } from "./redisCommandHandler";
import { redisProtocolParser } from "./redisProtocolParser";
import { socketsInfo } from "./socketsInfo";

export function createClient(
  host: string,
  hostPort: number,
  localPort: number,
): void {
  let data: Buffer = Buffer.alloc(0);

  const socket: net.Socket = net.createConnection(
    { host, port: hostPort, localPort },
    () => {
      console.log(`CLIENT connected to host: ${host} at port: ${hostPort}`);

      socket.write(redisProtocolEncoder.encodeRespArr(["PING"]));

      socketsInfo.add(socket);
    },
  );

  // Listen for server
  socket.on("data", (chunkOfData: Buffer) => {
    data = Buffer.concat([data, chunkOfData]);
    try {
      const decodedData: string[][] = redisProtocolParser.readCommand(
        data.toString("binary"),
      );

      console.log(
        `Received DATA from MASTER server: "${JSON.stringify(data.toString())}"`,
      );
      console.log("decodedData", decodedData);
      data = Buffer.alloc(0);

      (socket as any).manualLocalPort = localPort;
      redisCommandHandler.processCommands(decodedData, socket);
    } catch (err) {
      console.log(err);
      return;
    }
  });

  // Handle disconnection
  socket.on("end", () => {
    console.log("Disconnected from server");
    socketsInfo.remove(socket);
  });
}
