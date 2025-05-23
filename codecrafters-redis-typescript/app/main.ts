import * as net from "net";
import fs from "fs";
import { EOpCode, type IInfo } from "./model";

class RdbHandler {
  private readonly CRLF = "\r\n";
  private readonly WRITE_COMMANDS: string[] = ["SET"];

  private STORED_KEY_VAL_PAIRS: { [key: string]: string } = {};
  private AUX_KEY_VAL_PAIRS: { [key: string]: string } = {};
  private KEY_VAL_WITHOUT_EXPIRY: { [key: string]: string } = {};
  private KEY_VAL_WITH_EXPIRY: { [key: string]: string } = {};

  private dir: string = "";
  private dbFileName: string = "";

  private parseRdbFileOffset: number = 0;
  private parseRedisProtocolOffset: number = 0;

  private port: number = 6379;
  private info: IInfo = {
    role: "master",
    master_repl_offset: 0,
    master_replid: "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb",
  };

  private EMPTY_RDB_FILE_HEX: string =
    "524544495330303131fa0972656469732d76657205372e322e30fa0a72656469732d62697473c040fa056374696d65c26d08bc65fa08757365642d6d656dc2b0c41000fa08616f662d62617365c000fff06e3bfec0ff5aa2";

  private sockets: net.Socket[] = [];
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

    const client: net.Socket = net.createConnection({ host, port }, () => {
      console.log(
        `Client replica connected to master server at port: ${this.port} `
      );

      client.write(this.encodeArrWithBulkStrings(["PING"]));
    });

    let numberOfResponses = 0;
    // Listen for server
    client.on("data", (data) => {
      console.log("Received DATA from MASTER server:", data.toString());

      const decodedWords = this.redisProtocolParser(data.toString());
      console.log("decodedWords", decodedWords);

      // Received PONG
      if (decodedWords[0] === "PONG") {
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

      // Received OK
      else if (decodedWords[0] === "OK") {
        numberOfResponses++;
        if (numberOfResponses === 2) {
          client.write(this.encodeArrWithBulkStrings(["PSYNC", "?", "-1"]));
        }
      }

      // Received FULLRESYNC
      else if (
        decodedWords[0].startsWith("FULLRESYNC") ||
        decodedWords[0].startsWith("REDIS0011")
      ) {
      }

      // ERROR
      else {
        throw new Error("Unexpected response");
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

  redisProtocolParser(data: string): string[] {
    const type: string = data[this.parseRedisProtocolOffset];
    const words: string[] = [];

    switch (type) {
      case "*":
        this.parseRedisProtocolOffset++;

        const arrLenAsStr = data.slice(
          this.parseRedisProtocolOffset,
          data.indexOf(this.CRLF, this.parseRedisProtocolOffset)
        );
        const arrLen = Number.parseInt(arrLenAsStr);

        this.parseRedisProtocolOffset += arrLenAsStr.length;
        this.parseRedisProtocolOffset += 2;

        for (let i = 0; i < arrLen; i++) {
          const word = this.redisProtocolParser(data);
          words.push(...word);
        }

        return words;

      case "$":
        const word = this.readRedisProtocolLine(data);
        words.push(word);
        return words;

      case "+": {
        const word = data.slice(1, data.indexOf(this.CRLF));
        words.push(word);
        return words;
      }

      default:
        throw new Error("Unhandled RESP data type");
    }
  }

  readRedisProtocolLine(data: string): string {
    this.parseRedisProtocolOffset++;

    const firstCRLFIndex = data.indexOf(
      this.CRLF,
      this.parseRedisProtocolOffset
    );

    if (firstCRLFIndex === -1) {
      throw new Error("Invalid frame");
    }

    const lengthAsStr = data.slice(
      this.parseRedisProtocolOffset,
      firstCRLFIndex
    );
    const len = Number.parseInt(lengthAsStr);

    this.parseRedisProtocolOffset += lengthAsStr.length;
    this.parseRedisProtocolOffset += 2;

    const word = data.slice(
      this.parseRedisProtocolOffset,
      this.parseRedisProtocolOffset + len
    );

    this.parseRedisProtocolOffset += len;
    this.parseRedisProtocolOffset += 2;

    return word;
  }

  createServer(): void {
    const server: net.Server = net.createServer((socket: net.Socket) => {
      // Handle connection
      console.log("New client connected");

      socket.on("data", (data) => {
        console.log(
          `Received data from CLIENT: ${JSON.stringify(data.toString())}`
        );
        this.parseRedisProtocolOffset = 0;
        this.parseRdbFileOffset = 0;

        const decodedData = this.redisProtocolParser(data.toString());

        // Propagate commands
        if (this.WRITE_COMMANDS.includes(decodedData[0])) {
          this.propagateCommand(decodedData);
        }

        console.log("DECODED DATA: ", decodedData);
        this.handleRedisCommand(decodedData, socket);
      });
    });

    server.listen(this.port, "127.0.0.1");
  }

  propagateCommand(decodedData: string[]) {
    this.sockets.forEach((socket) =>
      socket.write(this.encodeArrWithBulkStrings(decodedData))
    );
  }

  handleRedisCommand(decodedData: string[], socket: net.Socket): void {
    for (let i = 0; i < decodedData.length; i++) {
      switch (decodedData[i].toLowerCase()) {
        case "echo":
          i++;
          const arg = decodedData[i];
          socket.write(this.encodeBulkString(arg));

          break;

        case "ping":
          socket.write(this.encodeBulkString("PONG"));

          break;

        case "set":
          i++;

          const key = decodedData[i];
          const val = decodedData[i + 1];
          this.STORED_KEY_VAL_PAIRS[key] = val;

          i += 2;

          // Handle expiry
          if (decodedData[i]?.toLowerCase() === "px") {
            i++;
            const expiryTime = Number.parseInt(decodedData[i]);

            setTimeout(() => {
              delete this.STORED_KEY_VAL_PAIRS[key];
            }, expiryTime);
          }

          socket.write(this.encodeSimpleString("OK"));

          break;

        case "get":
          i++;

          if (
            this.STORED_KEY_VAL_PAIRS[decodedData[i]] ||
            this.KEY_VAL_WITHOUT_EXPIRY[decodedData[i]] ||
            this.KEY_VAL_WITH_EXPIRY[decodedData[i]]
          ) {
            const value =
              this.STORED_KEY_VAL_PAIRS[decodedData[i]] ||
              this.KEY_VAL_WITHOUT_EXPIRY[decodedData[i]] ||
              this.KEY_VAL_WITH_EXPIRY[decodedData[i]];

            socket.write(this.encodeBulkString(value));
          } else {
            socket.write(this.nullBulkString());
          }

          break;

        case "config":
          i++;

          if (decodedData[i]?.toLowerCase() === "get") {
            i++;
            if (decodedData[i] === "dir") {
              socket.write(this.encodeArrWithBulkStrings(["dir", this.dir]));
            } else if (decodedData[i] === "dbfilename") {
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
          i++;

          if (decodedData[i] === "*") {
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
          i++;
          if (decodedData[i] === "replication") {
            socket.write(this.encodeBulkString(this.createStringFromInfo()));
          } else {
            throw new Error("Unhandled info argument");
          }

          break;

        case "replconf":
          socket.write(this.encodeSimpleString("OK"));

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

          this.sockets.push(socket);

          break;

        default:
          console.log(`Unhandled REDIS command ${decodedData[i]}`);
          break;
      }
    }
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
