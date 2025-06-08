import * as net from "net";
import { rdbFileParser } from "./rdbFileParser";
import { redisProtocolParser } from "./redisProtocolParser";
import { redisCommandHandler } from "./redisCommandHandler";
import { redisProtocolEncoder } from "./redisProtocolEncoder";

class RdbHandler {
  private port: number = 6379;

  constructor() {
    this.handleCommandLineArgs();
    this.createServer();
    rdbFileParser.readRdbFileIfExists();
  }

  private handleCommandLineArgs(): void {
    const args = process.argv.slice(2);
    console.log(`CMD ARGS: ${args}`);

    // --dir and --dbFileName
    if (args.includes("--dir") && args.includes("--dbfilename")) {
      rdbFileParser.dir = args[args.indexOf("--dir") + 1];
      rdbFileParser.dbFileName = args[args.indexOf("--dbfilename") + 1];
    }

    // --port
    if (
      args.includes("--port") &&
      Number.parseInt(args[args.indexOf("--port") + 1])
    ) {
      this.port = Number.parseInt(args[1]);
    }

    // --replicaof
    if (args.includes("--replicaof")) {
      redisCommandHandler.info.role = "slave";
      const host = args[args.indexOf("--replicaof") + 1];
      const [hostName, port] = host.split(" ");
      this.createClient(hostName, Number.parseInt(port));
    }
  }

  private createClient(host: string, port: number): void {
    console.log(`CLIENT at host: ${host} and port: ${port}`);

    let data: Buffer = Buffer.alloc(0);

    const client: net.Socket = net.createConnection({ host, port }, () => {
      console.log(`CLIENT connected to MASTER at port: ${this.port}`);

      client.write(redisProtocolEncoder.encodeArrWithBulkStrings(["PING"]));
    });

    // Listen for server
    client.on("data", (chunkOfData) => {
      process.stdout.write(
        `Received CHUNK OF DATA from MASTER server: "${JSON.stringify(
          chunkOfData.toString()
        )}"\n`
      );

      data = Buffer.concat([data, chunkOfData]);
      const decodedData: string[][] = redisProtocolParser.readRedisProtocol(
        data.toString("binary")
      );

      console.log(
        `Received DATA from MASTER server: "${JSON.stringify(data.toString())}"`
      );
      if (decodedData.length === 0) {
        return;
      }
      console.log("decodedData", decodedData);
      data = Buffer.alloc(0);

      redisCommandHandler.handleRedisCommand(
        decodedData,
        client,
        false,
        this.port
      );
    });

    // Handle disconnection
    client.on("end", () => {
      console.log("Disconnected from server");
    });
  }

  private createServer(): void {
    let data = Buffer.alloc(0);

    const server: net.Server = net.createServer((socket: net.Socket) => {
      // Handle connection
      console.log("New client connected");

      socket.on("data", async (chunkOfData) => {
        console.log(
          `Received chunk of data from CLIENT: ${JSON.stringify(
            chunkOfData.toString()
          )}\n`
        );

        data = Buffer.concat([data, chunkOfData]);
        const decodedData = redisProtocolParser.readRedisProtocol(
          data.toString()
        );
        console.log(
          `Received data from CLIENT: ${JSON.stringify(data.toString())}`
        );

        if (decodedData.length === 0) {
          return;
        }
        data = Buffer.alloc(0);
        console.log("DECODED DATA: ", decodedData);

        await redisCommandHandler.handleRedisCommand(
          decodedData,
          socket,
          true,
          0
        );
      });
    });

    server.listen(this.port, "127.0.0.1");
  }
}

const handler = new RdbHandler();
