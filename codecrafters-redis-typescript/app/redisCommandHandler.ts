import * as net from "net";
import type { IInfo, ISocketInfo, IStreamEntry } from "./model";
import { redisProtocolEncoder } from "./redisProtocolEncoder";
import { rdbFileParser } from "./rdbFileParser";

class RedisCommandHandler {
  public info: IInfo = {
    role: "master",
    master_repl_offset: 0,
    master_replid: "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb",
  };

  public STORED_KEY_VAL_PAIRS: { [key: string]: string } = {};
  private STORED_STREAMS: { [key: string]: IStreamEntry[] } = {};

  private replicasSockets: ISocketInfo[] = [];
  private clientSockets: ISocketInfo[] = [];

  constructor() {}

  async handleRedisCommand(
    decodedData: string[][],
    socket: net.Socket,
    masterReplies: boolean,
    port: number
  ): Promise<void> {
    this.clientSockets.push({
      socket,
      processedBytes: 0,
      numberOfResponses: 0,
      propagatedBytes: 0,
    });

    for (let i = 0; i < decodedData.length; i++) {
      let propagatedCommand = false;

      switch (decodedData[i][0].toLowerCase()) {
        case "echo":
          const arg = decodedData[i][1];
          socket.write(redisProtocolEncoder.encodeBulkString(arg));

          break;

        case "ping":
          if (masterReplies) {
            socket.write(redisProtocolEncoder.encodeBulkString("PONG"));
          }
          if (!masterReplies) {
            propagatedCommand = true;
          }

          break;

        case "ok":
          const socketInfo = this.getSocketInfo(masterReplies, socket);

          socketInfo.numberOfResponses++;
          if (socketInfo.numberOfResponses === 2) {
            socket.write(
              redisProtocolEncoder.encodeArrWithBulkStrings([
                "PSYNC",
                "?",
                "-1",
              ])
            );
          }

          break;

        case "pong":
          socket.write(
            redisProtocolEncoder.encodeArrWithBulkStrings([
              "REPLCONF",
              "listening-port",
              `${port}`,
            ])
          );
          socket.write(
            redisProtocolEncoder.encodeArrWithBulkStrings([
              "REPLCONF",
              "capa",
              "psync2",
            ])
          );
          break;

        case "set":
          const key = decodedData[i][1];
          const val = decodedData[i][2];
          this.STORED_KEY_VAL_PAIRS[key] = val;

          // Handle expiry
          if (masterReplies) {
            if (decodedData[i][3]?.toLowerCase() === "px") {
              const expiryTime = Number.parseInt(decodedData[i][4]);

              setTimeout(() => {
                delete this.STORED_KEY_VAL_PAIRS[key];
              }, expiryTime);
            }

            socket.write(redisProtocolEncoder.encodeSimpleString("OK"));

            this.propagateCommand(decodedData[i]);
          } else {
            propagatedCommand = true;
          }

          break;

        case "get":
          if (
            this.STORED_KEY_VAL_PAIRS[decodedData[i][1]] ||
            rdbFileParser.KEY_VAL_WITHOUT_EXPIRY[decodedData[i][1]] ||
            rdbFileParser.KEY_VAL_WITH_EXPIRY[decodedData[i][1]]
          ) {
            const value =
              this.STORED_KEY_VAL_PAIRS[decodedData[i][1]] ||
              rdbFileParser.KEY_VAL_WITHOUT_EXPIRY[decodedData[i][1]] ||
              rdbFileParser.KEY_VAL_WITH_EXPIRY[decodedData[i][1]];

            socket.write(redisProtocolEncoder.encodeBulkString(value));
          } else {
            socket.write(redisProtocolEncoder.nullBulkString());
          }

          break;

        case "config":
          if (decodedData[i][1]?.toLowerCase() === "get") {
            if (decodedData[i][2] === "dir") {
              socket.write(
                redisProtocolEncoder.encodeArrWithBulkStrings([
                  "dir",
                  rdbFileParser.dir,
                ])
              );
            } else if (decodedData[i][2] === "dbfilename") {
              socket.write(
                redisProtocolEncoder.encodeArrWithBulkStrings([
                  "dbfilename",
                  rdbFileParser.dbFileName,
                ])
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
              redisProtocolEncoder.encodeArrWithBulkStrings([
                ...Object.keys(rdbFileParser.KEY_VAL_WITHOUT_EXPIRY),
                ...Object.keys(rdbFileParser.KEY_VAL_WITH_EXPIRY),
              ])
            );
          } else {
            throw new Error("Unsupported keys arg");
          }

          break;

        case "info":
          if (decodedData[i][1] === "replication") {
            socket.write(
              redisProtocolEncoder.encodeBulkString(this.createStringFromInfo())
            );
          } else {
            throw new Error("Unhandled info argument");
          }

          break;

        case "replconf":
          if (decodedData[i][1] === "ACK") {
            const socketInfo = this.getSocketInfo(masterReplies, socket);

            socketInfo.processedBytes = Number.parseInt(decodedData[i][2]);
            socketInfo.propagatedBytes +=
              redisProtocolEncoder.encodeArrWithBulkStrings([
                "REPLCONF",
                "GETACK",
                "*",
              ]).length;
          } else if (decodedData[i][1] === "GETACK") {
            const socketInfo = this.getSocketInfo(masterReplies, socket);

            socket.write(
              redisProtocolEncoder.encodeArrWithBulkStrings([
                "REPLCONF",
                "ACK",
                `${socketInfo.processedBytes}`,
              ])
            );
            propagatedCommand = true;
          } else {
            socket.write(redisProtocolEncoder.encodeSimpleString("OK"));
          }

          break;

        case "psync":
          socket.write(
            redisProtocolEncoder.encodeSimpleString(
              `FULLRESYNC ${this.info.master_replid} ${this.info.master_repl_offset}`
            )
          );

          // Send empty RDB file
          const buf = Buffer.from(rdbFileParser.EMPTY_RDB_FILE_HEX, "hex");
          const finalBuf = Buffer.concat([
            Buffer.from(`$${buf.length}\r\n`),
            buf,
          ]);
          socket.write(finalBuf);

          this.replicasSockets.push({
            socket,
            processedBytes: 0,
            propagatedBytes: 0,
            numberOfResponses: 0,
          });
          this.removeReplicaFromClientSocketsArr(socket);

          break;

        case "wait":
          await new Promise((resolve) => {
            const numOfAckReplicasNeeded = Number.parseInt(decodedData[i][1]);
            const expireTime = Number.parseInt(decodedData[i][2]);

            const askForACKInterval = setInterval(() => {
              this.replicasSockets.forEach((socketInfo) => {
                const respEncodedCommand =
                  redisProtocolEncoder.encodeArrWithBulkStrings([
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

        case "type":
          {
            const key = decodedData[i][1];
            const value = this.STORED_KEY_VAL_PAIRS[key];
            const stream = this.STORED_STREAMS[key];

            if (value) {
              socket.write(
                redisProtocolEncoder.encodeSimpleString(typeof value)
              );
            } else if (stream) {
              socket.write(redisProtocolEncoder.encodeSimpleString("stream"));
            } else {
              socket.write(redisProtocolEncoder.encodeSimpleString("none"));
            }
          }
          break;

        case "xadd":
          const streamKey = decodedData[i][1];
          let streamID = decodedData[i][2];

          if (streamID === "*") {
            streamID = this.createStreamID(streamKey);
          }

          const isValid = this.checkStreamValidity(
            streamID,
            streamKey,
            socket,
            !!decodedData[i][3]
          );
          if (!isValid) {
            break;
          }

          const [streamIDMilliSecondsTime, sequenceNumber] = this.parseStreamID(
            streamID,
            streamKey
          );
          streamID = `${streamIDMilliSecondsTime}-${sequenceNumber}`;

          const keyValPairs = this.parseKeyValPairs(decodedData[i]);
          const streamEntry: IStreamEntry = {
            streamID,
            streamIDMilliSecondsTime,
            sequenceNumber,
            ...keyValPairs,
          };
          this.STORED_STREAMS[streamKey] ??= [];
          this.STORED_STREAMS[streamKey].push(streamEntry);

          console.log("STREAMS: ", this.STORED_STREAMS);
          socket.write(redisProtocolEncoder.encodeSimpleString(streamID));

          break;

        default:
          if (
            decodedData[i][0].startsWith("FULLRESYNC") ||
            decodedData[i][0].startsWith("REDIS0011")
          ) {
          } else {
            throw new Error(`Unhandled REDIS command ${decodedData[i]}`);
          }
      }

      if (!masterReplies && propagatedCommand) {
        const socketInfo = this.getSocketInfo(masterReplies, socket);

        socketInfo.processedBytes +=
          redisProtocolEncoder.encodeArrWithBulkStrings(decodedData[i]).length;
      }
    }
  }

  private propagateCommand(decodedData: string[]): void {
    this.replicasSockets.forEach((sockInfo) => {
      const respEncodedCommand =
        redisProtocolEncoder.encodeArrWithBulkStrings(decodedData);
      sockInfo.socket.write(respEncodedCommand);
      sockInfo.propagatedBytes += respEncodedCommand.length;
      console.log(`${sockInfo.propagatedBytes}/${sockInfo.processedBytes}`);
    });
  }

  private createStringFromInfo(): string {
    let result = "";
    Object.keys(this.info).forEach(
      (key) => (result += `${key}:${(this.info as any)[key]}`)
    );
    return result;
  }

  private removeReplicaFromClientSocketsArr(socket: net.Socket): void {
    const deletionIndex = this.clientSockets.findIndex(
      (socketInfo) => socketInfo.socket === socket
    );

    this.clientSockets.splice(deletionIndex, 1);
  }

  private getSocketInfo(
    masterReplies: boolean,
    socket: net.Socket
  ): ISocketInfo {
    if (masterReplies) {
      return this.replicasSockets.find(
        (sockInfo) => sockInfo.socket === socket
      )!;
    } else {
      return this.clientSockets.find((sockInfo) => sockInfo.socket === socket)!;
    }
  }

  private parseStreamID(streamID: string, streamKey: string): number[] {
    try {
      const [val1, val2] = streamID.split("-");
      const streamIDMilliSecondsTime = Number.parseInt(val1);
      let sequenceNumber: number;

      if (val2 === "*") {
        const topStream = this.STORED_STREAMS[streamKey]?.slice().pop();
        const topSeqNum = topStream?.sequenceNumber;
        const topSeqMs = topStream?.streamIDMilliSecondsTime;

        sequenceNumber =
          topStream &&
          topSeqNum !== undefined &&
          topSeqMs === streamIDMilliSecondsTime
            ? topSeqNum + 1
            : streamIDMilliSecondsTime === 0
            ? 1
            : 0;
      } else {
        sequenceNumber = Number.parseInt(val2);
      }

      return [streamIDMilliSecondsTime, sequenceNumber];
    } catch (err) {
      throw new Error("Invalid stream ID");
    }
  }

  private parseKeyValPairs(decodedData: string[]): { [key: string]: string } {
    const dict: { [key: string]: string } = {};
    for (let j = 3; j < decodedData.length; j++) {
      dict[decodedData[j]] = decodedData[j + 1];
      j++;
    }

    return dict;
  }

  private checkStreamValidity(
    streamID: string,
    streamKey: string,
    socket: net.Socket,
    containsKeyValP: boolean
  ): boolean {
    const [ms, seqNum] = streamID.split("-");
    const topStream = this.STORED_STREAMS[streamKey]?.slice().pop();

    if (
      Number.parseInt(ms) === 0 &&
      Number.parseInt(seqNum) === 0 &&
      containsKeyValP
    ) {
      socket.write(
        redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD must be greater than 0-0"
        )
      );
      return false;
    }

    if (topStream && seqNum !== "*") {
      if (topStream.streamIDMilliSecondsTime > Number.parseInt(ms)) {
        socket.write(
          redisProtocolEncoder.encodeSimpleError(
            "ERR The ID specified in XADD is equal or smaller than the target stream top item"
          )
        );
        return false;
      } else if (
        topStream.streamIDMilliSecondsTime === Number.parseInt(ms) &&
        topStream.sequenceNumber >= Number.parseInt(seqNum)
      ) {
        socket.write(
          redisProtocolEncoder.encodeSimpleError(
            "ERR The ID specified in XADD is equal or smaller than the target stream top item"
          )
        );
        return false;
      } else if (
        Number.parseInt(ms) > topStream.streamIDMilliSecondsTime &&
        Number.parseInt(seqNum) < topStream.sequenceNumber
      ) {
        socket.write(
          redisProtocolEncoder.encodeSimpleError(
            "ERR The ID specified in XADD is equal or smaller than the target stream top item"
          )
        );
        return false;
      }
    } else if (topStream && seqNum === "*") {
      if (topStream.streamIDMilliSecondsTime > Number.parseInt(ms)) {
        socket.write(
          redisProtocolEncoder.encodeSimpleError(
            "ERR The ID specified in XADD is equal or smaller than the target stream top item"
          )
        );
        return false;
      }
    }

    return true;
  }

  private createStreamID(streamKey: string): string {
    const topStream = this.STORED_STREAMS[streamKey]?.slice().pop();
    const topSeqNum = topStream?.sequenceNumber;
    const topMs = topStream?.sequenceNumber;

    if (topSeqNum && topMs) {
      if (Date.now() === topMs) {
        return `${Date.now()}-${topSeqNum + 1}`;
      } else if (Date.now() > topMs) {
        return `${Date.now()}-${topSeqNum}`;
      } else {
        throw new Error("Error creating the streamID");
      }
    } else {
      return `${Date.now()}-0`;
    }
  }
}

const redisCommandHandler = new RedisCommandHandler();
export { redisCommandHandler };
