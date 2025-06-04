import * as net from "net";
import fs from "fs";
import { EOpCode, type IReplicaInfo, type IInfo } from "./model";

class RdbHandler {
  private STORED_KEY_VAL_PAIRS: { [key: string]: string } = {};
  private AUX_KEY_VAL_PAIRS: { [key: string]: string } = {};
  private KEY_VAL_WITHOUT_EXPIRY: { [key: string]: string } = {};
  private KEY_VAL_WITH_EXPIRY: { [key: string]: string } = {};

  private dir: string = "";
  private dbFileName: string = "";

  private parseRdbFileOffset: number = 0;

  private port: number = 6379;
  private info: IInfo = {
    role: "master",
    master_repl_offset: 0,
    master_replid: "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb",
  };

  private EMPTY_RDB_FILE_HEX: string =
    "524544495330303131fa0972656469732d76657205372e322e30fa0a72656469732d62697473c040fa056374696d65c26d08bc65fa08757365642d6d656dc2b0c41000fa08616f662d62617365c000fff06e3bfec0ff5aa2";

  private replicasSockets: IReplicaInfo[] = [];

  constructor() {
    this.handleCommandLineArgs();
    this.createServer();
    this.readRdbFileIfExists();
  }

  handleCommandLineArgs(): void {
    const args = process.argv.slice(2);
    console.log(`CMD ARGS: ${args}`);

    // --dir and --dbFileName
    if (args.includes("--dir") && args.includes("--dbfilename")) {
      this.dir = args[args.indexOf("--dir") + 1];
      this.dbFileName = args[args.indexOf("--dbfilename") + 1];
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
      this.info.role = "slave";
      const host = args[args.indexOf("--replicaof") + 1];
      const [hostName, port] = host.split(" ");
      this.createClient(hostName, Number.parseInt(port));
    }
  }

  createClient(host: string, port: number) {
    console.log(`Client replica at host: ${host} and port: ${port}`);

    let data: Buffer = Buffer.alloc(0);
    let numberOfResponses = 0;
    let startTrackingOffset = false;
    let numberOfBytesProcessed = 0;

    const client: net.Socket = net.createConnection({ host, port }, () => {
      console.log(
        `Client replica connected to master server at port: ${this.port} `
      );

      client.write(this.encodeArrWithBulkStrings(["PING"]));
    });

    // Listen for server
    client.on("data", (chunkOfData) => {
      process.stdout.write(
        `Received CHUNK OF DATA from MASTER server: "${chunkOfData
          .toString("binary")
          .replaceAll("\n", "\\n")
          .replaceAll("\r", "\\r")}"\n`
      );

      data = Buffer.concat([data, chunkOfData]);
      const decodedData: string[][] = this.readRedisProtocol(
        data.toString("binary")
      );

      console.log("decodedData", decodedData);
      console.log(`Received DATA from MASTER server: "${data.toString()}"`);
      if (decodedData.length === 0) {
        return;
      }
      data = Buffer.alloc(0);

      for (let i = 0; i < decodedData.length; i++) {
        // Received PONG
        if (decodedData[i][0] === "PONG") {
          client.write(
            this.encodeArrWithBulkStrings([
              "REPLCONF",
              "listening-port",
              `${this.port}`,
            ])
          );
          client.write(
            this.encodeArrWithBulkStrings(["REPLCONF", "capa", "psync2"])
          );
        }

        // Received PING
        else if (decodedData[i][0] === "PING") {
        }

        // Received OK
        else if (decodedData[i][0] === "OK") {
          numberOfResponses++;
          if (numberOfResponses === 2) {
            client.write(this.encodeArrWithBulkStrings(["PSYNC", "?", "-1"]));
          }
        }

        // Received FULLRESYNC
        else if (
          decodedData[i][0].startsWith("FULLRESYNC") ||
          decodedData[i][0].startsWith("REDIS0011")
        ) {
        }

        // Received SET
        else if (decodedData[i][0] === "SET") {
          const key = decodedData[i][1];
          const val = decodedData[i][2];

          this.STORED_KEY_VAL_PAIRS[key] = val;
        }

        // Received REPLCONF
        else if (decodedData[i][0] === "REPLCONF") {
          client.write(
            this.encodeArrWithBulkStrings([
              "REPLCONF",
              "ACK",
              `${numberOfBytesProcessed}`,
            ])
          );
          startTrackingOffset = true;
        }

        // ERROR
        else {
          throw new Error("Unexpected response");
        }

        if (startTrackingOffset) {
          numberOfBytesProcessed += this.encodeArrWithBulkStrings(
            decodedData[i]
          ).length;
        }
      }
    });

    // Handle disconnection
    client.on("end", () => {
      console.log("Disconnected from server");
    });
  }

  encodeArrWithBulkStrings(strArr: string[]): string {
    let output = `*${strArr.length}\r\n`;
    for (let i = 0; i < strArr.length; i++) {
      output += this.encodeBulkString(strArr[i]);
    }

    return output;
  }

  encodeBulkString(data: string): string {
    return `$${data.length}\r\n${data}\r\n`;
  }

  readRedisProtocol(data: string) {
    let i = 0;
    const decodedData: string[][] = [];

    try {
      while (i < data.length - 1) {
        const { newDecodedData, newIndex } = this.redisProtocolParser(data, i);
        decodedData.push(newDecodedData);
        i = newIndex;
      }

      return decodedData;
    } catch (err) {
      console.log(err);
      return [];
    }
  }

  redisProtocolParser(
    data: string,
    i: number
  ): { newDecodedData: string[]; newIndex: number } {
    const decodedData: string[] = [];

    while (i < data.length - 1) {
      const type = data[i];

      // Resp array
      if (type === "*") {
        i++;
        const start = i;
        while (data[i] !== "\r") {
          i++;

          if (i >= data.length) {
            throw new Error("Invalid Resp array");
          }
        }

        const size = data.slice(start, i);
        i += size.length;
        i++;

        for (let j = 0; j < Number.parseInt(size); j++) {
          const { newDecodedData, newIndex } = this.redisProtocolParser(
            data,
            i
          );
          decodedData.push(...newDecodedData);
          i = newIndex;
        }

        return { newDecodedData: decodedData, newIndex: i };
      }

      // Bulk string
      else if (type === "$") {
        const { word, i: newIndex } = this.readRedisProtocolLine(data, i);
        i = newIndex;
        decodedData.push(word);
        return { newDecodedData: decodedData, newIndex: i };
      }

      // Simple string
      else if (type === "+") {
        i++;
        const nextCRLF = "\r\n";
        const endOfString = data.indexOf(nextCRLF, i);

        if (endOfString === -1) {
          throw new Error("Invalid simple string");
        }

        const word = data.slice(i, endOfString);
        i += word.length + 2;
        decodedData.push(word);
        return { newDecodedData: decodedData, newIndex: i };
      } else {
        throw new Error("Unhandled Resp type");
      }
    }

    throw new Error("Could not parse correctly");
  }

  readRedisProtocolLine(data: string, i: number): { word: string; i: number } {
    i++;

    const firstCRLFIndex = data.indexOf("\r\n", i);

    if (firstCRLFIndex === -1) {
      throw new Error("Invalid frame");
    }

    const lengthAsStr = data.slice(i, firstCRLFIndex);
    const len = Number.parseInt(lengthAsStr);

    i += lengthAsStr.length;
    i += 2;

    const word = data.slice(i, i + len);

    i += len;

    if (data[i] === "\r") {
      i += 2;
    }

    return { word, i };
  }

  createServer(): void {
    let data = Buffer.alloc(0);

    const server: net.Server = net.createServer((socket: net.Socket) => {
      // Handle connection
      console.log("New client connected");

      socket.on("data", async (chunkOfData) => {
        console.log(
          `Received chunk of data from CLIENT: ${JSON.stringify(
            chunkOfData.toString()
          )}`
        );

        data = Buffer.concat([data, chunkOfData]);
        const decodedData = this.readRedisProtocol(data.toString());
        console.log(
          `Received data from CLIENT: ${JSON.stringify(data.toString())}`
        );

        if (decodedData.length === 0) {
          return;
        }
        data = Buffer.alloc(0);
        console.log("DECODED DATA: ", decodedData);

        await this.handleRedisCommand(decodedData, socket);
      });
    });

    server.listen(this.port, "127.0.0.1");
  }

  async handleRedisCommand(
    decodedData: string[][],
    socket: net.Socket
  ): Promise<void> {
    for (let i = 0; i < decodedData.length; i++) {
      switch (decodedData[i][0].toLowerCase()) {
        case "echo":
          const arg = decodedData[i][1];
          socket.write(this.encodeBulkString(arg));

          break;

        case "ping":
          socket.write(this.encodeBulkString("PONG"));

          break;

        case "set":
          const key = decodedData[i][1];
          const val = decodedData[i][2];
          this.STORED_KEY_VAL_PAIRS[key] = val;

          // Handle expiry
          if (decodedData[i][3]?.toLowerCase() === "px") {
            const expiryTime = Number.parseInt(decodedData[i][4]);

            setTimeout(() => {
              delete this.STORED_KEY_VAL_PAIRS[key];
            }, expiryTime);
          }

          socket.write(this.encodeSimpleString("OK"));

          this.propagateCommand(decodedData[i]);

          break;

        case "get":
          if (
            this.STORED_KEY_VAL_PAIRS[decodedData[i][1]] ||
            this.KEY_VAL_WITHOUT_EXPIRY[decodedData[i][1]] ||
            this.KEY_VAL_WITH_EXPIRY[decodedData[i][1]]
          ) {
            const value =
              this.STORED_KEY_VAL_PAIRS[decodedData[i][1]] ||
              this.KEY_VAL_WITHOUT_EXPIRY[decodedData[i][1]] ||
              this.KEY_VAL_WITH_EXPIRY[decodedData[i][1]];

            socket.write(this.encodeBulkString(value));
          } else {
            socket.write(this.nullBulkString());
          }

          break;

        case "config":
          if (decodedData[i][1]?.toLowerCase() === "get") {
            if (decodedData[i][2] === "dir") {
              socket.write(this.encodeArrWithBulkStrings(["dir", this.dir]));
            } else if (decodedData[i][2] === "dbfilename") {
              socket.write(
                this.encodeArrWithBulkStrings(["dbfilename", this.dbFileName])
              );
            } else {
              throw new Error("Wrong CONFIG command");
            }
          } else {
            throw new Error("Unhandled CONFIG req");
          }

          break;

        case "keys":
          if (decodedData[i][1] === "*") {
            socket.write(
              this.encodeArrWithBulkStrings([
                ...Object.keys(this.KEY_VAL_WITHOUT_EXPIRY),
                ...Object.keys(this.KEY_VAL_WITH_EXPIRY),
              ])
            );
          } else {
            throw new Error("Unsupported keys arg");
          }

          break;

        case "info":
          if (decodedData[i][1] === "replication") {
            socket.write(this.encodeBulkString(this.createStringFromInfo()));
          } else {
            throw new Error("Unhandled info argument");
          }

          break;

        case "replconf":
          if (decodedData[i][1] === "ACK") {
            const socketInfo = this.replicasSockets.find(
              (sockInfo) => sockInfo.socket === socket
            )!;

            socketInfo.processedBytes = Number.parseInt(decodedData[i][2]);
            socketInfo.propagatedBytes += this.encodeArrWithBulkStrings([
              "REPLCONF",
              "GETACK",
              "*",
            ]).length;
          } else {
            socket.write(this.encodeSimpleString("OK"));
          }

          break;

        case "psync":
          socket.write(
            this.encodeSimpleString(
              `FULLRESYNC ${this.info.master_replid} ${this.info.master_repl_offset}`
            )
          );

          // Send empty RDB file
          const buf = Buffer.from(this.EMPTY_RDB_FILE_HEX, "hex");
          const finalBuf = Buffer.concat([
            Buffer.from(`$${buf.length}\r\n`),
            buf,
          ]);
          socket.write(finalBuf);

          this.replicasSockets.push({
            socket,
            processedBytes: 0,
            propagatedBytes: 0,
          });

          break;

        case "wait":
          await new Promise((resolve) => {
            const numOfAckReplicasNeeded = Number.parseInt(decodedData[i][1]);
            const expireTime = Number.parseInt(decodedData[i][2]);

            const askForACKInterval = setInterval(() => {
              this.replicasSockets.forEach((socketInfo) => {
                const respEncodedCommand = this.encodeArrWithBulkStrings([
                  "REPLCONF",
                  "GETACK",
                  "*",
                ]);
                socketInfo.socket.write(respEncodedCommand);
              });
            }, 20);

            const checkIfWaitResolvedInterval = setInterval(() => {
              const numOfAckReplicas = this.replicasSockets.filter(
                (socketInfo) =>
                  socketInfo.propagatedBytes === socketInfo.processedBytes ||
                  socketInfo.processedBytes + 37 === socketInfo.propagatedBytes
              ).length;
              if (numOfAckReplicas >= numOfAckReplicasNeeded) {
                clearInterval(checkIfWaitResolvedInterval);
                clearInterval(askForACKInterval);
                clearTimeout(resolveTimeout);

                resolve(socket.write(`:${numOfAckReplicas}\r\n`));
              }
            }, 10);

            const resolveTimeout = setTimeout(() => {
              clearInterval(checkIfWaitResolvedInterval);
              clearInterval(askForACKInterval);
              clearTimeout(resolveTimeout);

              const numOfAckReplicas = this.replicasSockets.filter(
                (socketInfo) =>
                  socketInfo.propagatedBytes === socketInfo.processedBytes ||
                  socketInfo.processedBytes + 37 === socketInfo.propagatedBytes
              ).length;
              this.replicasSockets.forEach((socketInfo) => {
                console.log(
                  `${socketInfo.propagatedBytes}/${socketInfo.processedBytes}`
                );
              });

              resolve(socket.write(`:${numOfAckReplicas}\r\n`));
            }, expireTime);
          });

          break;

        default:
          throw new Error(`Unhandled REDIS command ${decodedData[i]}`);
      }
    }
  }

  propagateCommand(decodedData: string[]) {
    this.replicasSockets.forEach((sockInfo) => {
      const respEncodedCommand = this.encodeArrWithBulkStrings(decodedData);
      sockInfo.socket.write(respEncodedCommand);
      sockInfo.propagatedBytes += respEncodedCommand.length;
      console.log(`${sockInfo.propagatedBytes}/${sockInfo.processedBytes}`);
    });
  }

  encodeSimpleString(data: string): string {
    return `+${data}\r\n`;
  }

  nullBulkString(): string {
    return "$-1\r\n";
  }

  handleExpiry(
    expireDate: number,
    obj: { [key: string]: string },
    key: string
  ) {
    const now = Date.now();
    const expireTime = expireDate - now;

    if (expireTime <= 0) {
      delete obj[key];
    } else {
      setTimeout(() => {
        delete obj[key];
      }, expireTime);
    }
  }

  createStringFromInfo() {
    let result = "";
    Object.keys(this.info).forEach(
      (key) => (result += `${key}:${(this.info as any)[key]}`)
    );
    return result;
  }

  readRdbFileIfExists() {
    if (this.dir && this.dbFileName) {
      const path = `${this.dir}/${this.dbFileName}`;
      try {
        this.parseRdbFileOffset = 0;

        const rdbFileContent = fs.readFileSync(path);

        console.log("RDB FILE BUFFER: ", rdbFileContent);
        console.log("RDB FILE STRING: ", rdbFileContent.toString());
        console.log("RDB FILE HEX: ", rdbFileContent.toString("hex"));

        this.parseRdbFile(rdbFileContent);
      } catch (err) {
        console.log(`${err} at path "${path}"`);
      }
    }
  }

  parseRdbFile(data: Buffer): void {
    const magicStr = data.slice(this.parseRdbFileOffset, 9).toString();
    this.parseRdbFileOffset += 9;

    if (magicStr !== "REDIS0011") {
      throw new Error("Unexpected file format");
    }

    while (true) {
      if (this.parseRdbFileOffset >= data.length - 1) {
        break;
      }

      this.parseOpCode(data);
    }

    console.log("NO EXPIRY", this.KEY_VAL_WITHOUT_EXPIRY);
    console.log("EXPIRY", this.KEY_VAL_WITH_EXPIRY);
    console.log("AUX:", this.AUX_KEY_VAL_PAIRS);
  }

  parseOpCode(data: Buffer) {
    switch (data[this.parseRdbFileOffset]) {
      case EOpCode.AUX:
        this.parseRdbFileOffset++;
        const key = this.readRedisString(data);
        this.parseRdbFileOffset++;
        const val = this.readRedisString(data);

        this.AUX_KEY_VAL_PAIRS[key.toString()] = val.toString();
        break;

      case EOpCode.SELECTDB:
        this.parseRdbFileOffset++;
        break;

      case EOpCode.RESIZE_DB:
        this.parseRdbFileOffset++;
        {
          const totalHashTableSize = this.readLength(data);
          this.parseRdbFileOffset++;
          const expiryHashTableSize = this.readLength(data);
          this.parseRdbFileOffset++;
          const hashTableSizeWithoutExpiry =
            totalHashTableSize - expiryHashTableSize;

          for (let i = 0; i < expiryHashTableSize; i++) {
            this.parseOpCode(data);
          }

          for (let i = 0; i < hashTableSizeWithoutExpiry; i++) {
            const objType = data[this.parseRdbFileOffset];
            this.parseRdbFileOffset++;
            const key = this.readRedisString(data);
            this.parseRdbFileOffset++;
            const val = this.readRedisString(data);

            if (i !== hashTableSizeWithoutExpiry - 1) {
              this.parseRdbFileOffset++;
            }

            this.KEY_VAL_WITHOUT_EXPIRY[key.toString()] = val.toString();
          }
        }

        break;

      case EOpCode.EXPIRE_TIME_SEC:
      case EOpCode.EXPIRE_TIME_MS:
        let expiryDate: number = 0;

        if (data[this.parseRdbFileOffset] === EOpCode.EXPIRE_TIME_SEC) {
          expiryDate =
            data.slice(this.parseRdbFileOffset).readUInt32LE(1) * 1000;
          this.parseRdbFileOffset += 5;
        } else {
          expiryDate = Number(
            data.slice(this.parseRdbFileOffset).readBigUInt64LE(1)
          );
          this.parseRdbFileOffset += 9;
        }

        {
          const objType = data[this.parseRdbFileOffset];
          this.parseRdbFileOffset++;
          const key = this.readRedisString(data);
          this.parseRdbFileOffset++;
          const val = this.readRedisString(data);

          this.KEY_VAL_WITH_EXPIRY[key.toString()] = val.toString();
          this.handleExpiry(
            expiryDate,
            this.KEY_VAL_WITH_EXPIRY,
            key.toString()
          );
        }

        break;

      case EOpCode.EOF:
        this.parseRdbFileOffset += 8;
        break;

      default:
        throw new Error("Unknown opCode");
    }

    this.parseRdbFileOffset++;
  }

  readLength(data: Buffer): number {
    const first = data[this.parseRdbFileOffset];
    const flag = first >> 6;

    switch (flag) {
      case 0: // MSB 00
        return first & 0x3f;

      case 1: {
        // MSB 01
        const val = ((first & 0x3f) << 6) | data[this.parseRdbFileOffset + 1];
        this.parseRdbFileOffset++;
        return val;
      }

      case 2: // MSB 10
        const val = data.slice(this.parseRdbFileOffset + 1).readInt32BE();
        this.parseRdbFileOffset += 4;
        return val;

      case 3: // MSB 11
        const encType = first & 0x3f;
        if (encType === 0) {
          this.parseRdbFileOffset++;
          return data[this.parseRdbFileOffset];
        }

        if (encType === 1) {
          const val = data.slice(this.parseRdbFileOffset + 1).readInt16BE(0);
          this.parseRdbFileOffset += 2;
          return val;
        }

        if (encType === 2) {
          const val = data.slice(this.parseRdbFileOffset).readInt32BE(0);
          this.parseRdbFileOffset += 4;
          return val;
        }

        throw new Error(`Unsupported special encoding at MSB 11`);

      default:
        throw new Error(`Unsupported special encoding`);
    }
  }

  readRedisString(data: Buffer): Buffer {
    const startingOffset = this.parseRdbFileOffset + 1;
    const first = data[this.parseRdbFileOffset];
    const flag = first >> 6;

    const value = this.readLength(data);

    if (flag === 3) {
      return Buffer.from(value.toString());
    } else {
      this.parseRdbFileOffset += value;
      return data.slice(startingOffset, startingOffset + value);
    }
  }
}

const handler = new RdbHandler();
// handler.parseRdbFile(
//   Buffer.from([
//     82, 69, 68, 73, 83, 48, 48, 49, 49, 250, 9, 114, 101, 100, 105, 115, 45,
//     118, 101, 114, 5, 55, 46, 50, 46, 48, 250, 10, 114, 101, 100, 105, 115, 45,
//     98, 105, 116, 115, 192, 64, 254, 0, 251, 5, 5, 252, 0, 12, 40, 138, 199, 1,
//     0, 0, 0, 5, 97, 112, 112, 108, 101, 9, 112, 105, 110, 101, 97, 112, 112,
//     108, 101, 252, 0, 12, 40, 138, 199, 1, 0, 0, 0, 9, 112, 105, 110, 101, 97,
//     112, 112, 108, 101, 6, 111, 114, 97, 110, 103, 101, 252, 0, 12, 40, 138,
//     199, 1, 0, 0, 0, 9, 98, 108, 117, 101, 98, 101, 114, 114, 121, 5, 97, 112,
//     112, 108, 101, 252, 0, 156, 239, 18, 126, 1, 0, 0, 0, 9, 114, 97, 115, 112,
//     98, 101, 114, 114, 121, 4, 112, 101, 97, 114, 252, 0, 12, 40, 138, 199, 1,
//     0, 0, 0, 6, 111, 114, 97, 110, 103, 101, 10, 115, 116, 114, 97, 119, 98,
//     101, 114, 114, 121, 255, 173, 57, 112, 55, 200, 70, 114, 78, 10,
//   ])
// );
// handler.parseRdbFile(
//   Buffer.from([
//     82, 69, 68, 73, 83, 48, 48, 49, 49, 250, 9, 114, 101, 100, 105, 115, 45,
//     118, 101, 114, 5, 55, 46, 50, 46, 48, 250, 10, 114, 101, 100, 105, 115, 45,
//     98, 105, 116, 115, 192, 64, 254, 0, 251, 1, 0, 0, 9, 112, 105, 110, 101, 97,
//     112, 112, 108, 101, 5, 103, 114, 97, 112, 101, 255, 144, 217, 29, 152, 66,
//     69, 250, 87, 10,
//   ])
// );
// console.log(
//   handler.readRedisProtocol(
//     "*3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\n123\r\n*3\r\n$3\r\nSET\r\n$3\r\nbar\r\n$3\r\n456\r\n*3\r\n$3\r\nSET\r\n$3\r\nbaz\r\n$3\r\n789\r\n"
//   )
// );
// console.log(
//   handler.readRedisProtocol("*1\r\n$4\r\nPING\r\n*1\r\n$4\r\nPING\r\n")
// );
// console.log(
//   handler.readRedisProtocol(
//     "+FULLRESYNC 75cd7bc10c49047e0d163660f3b90625b1af31dc 0\r\n$88\r\nREDIS0011ú   redis-ver7.2.0ú\nredis-bitsÀ@úctimeÂ¼eused-memÂ°Äaof-baseÀÿðn;þÀÿZ¢*3\r\n$8\r\nREPLCONF\r\n$6\r\nGETACK\r\n$1\r\n*\r\n"
//   )
// );
