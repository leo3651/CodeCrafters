import * as net from "net";
import { redisProtocolParser } from "./redisProtocolParser";
import { redisCommandHandler } from "./redisCommandHandler";
import { socketsInfo } from "./socketsInfo";

export function createServer(port: number) {
  const server: net.Server = net.createServer((socket: net.Socket) => {
    console.log(
      `New client connected ${socket.remoteAddress}:${socket.remotePort}`,
    );
    socketsInfo.add(socket);

    let receivedData: Buffer = Buffer.alloc(0);

    socket.on("data", (chunkOfData: Buffer) => {
      console.log(
        `Received chunk of data from client ${socket.remoteAddress}:${socket.remotePort}: ${JSON.stringify(chunkOfData.toString())}`,
      );

      receivedData = Buffer.concat([receivedData, chunkOfData]);

      try {
        const decodedData: string[][] = redisProtocolParser.readCommand(
          receivedData.toString("binary"),
        );
        console.log("DECODED DATA: ", decodedData);

        receivedData = Buffer.alloc(0);

        redisCommandHandler.processCommands(decodedData, socket);
      } catch (err) {
        console.log(err);
        return;
      }
    });

    socket.on("end", () => {
      console.log(
        `Client disconnected ${socket.remoteAddress}:${socket.remotePort}`,
      );
      socketsInfo.remove(socket);
    });
  });

  server.listen(port, "127.0.0.1");
}
