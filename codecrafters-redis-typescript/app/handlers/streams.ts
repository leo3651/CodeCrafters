import * as net from "net";

import { Subject, take, tap } from "rxjs";
import type { Stream, StreamEntry } from "../models/model";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";

class Streams {
  STORED_STREAMS: Stream[] = [];
  streamAdded$: Subject<void> = new Subject();

  public xAdd(socket: net.Socket, command: string[]): void {
    const streamKey: string = command[1];
    let streamID: string = command[2];

    if (streamID === "*") {
      streamID = this.createStreamID(streamKey);
    }

    const error: string = this.checkStreamValidity(
      streamID,
      streamKey,
      !!command[3],
    );
    if (error) {
      Response.handle(socket, error);
      return;
    }

    const [streamIDMilliSecondsTime, sequenceNumber]: number[] =
      this.parseStreamID(streamID, streamKey);
    streamID = `${streamIDMilliSecondsTime}-${sequenceNumber}`;

    this.storeStream(streamKey, [streamID, [...command.slice(3)]]);

    this.streamAdded$.next();
    Response.handle(socket, redisProtocolEncoder.encodeBulkString(streamID));
  }

  public xRange(socket: net.Socket, command: string[]): void {
    const streamKey: string = command[1];
    const streamIDStart: string = command[2];
    const streamIDEnd: string = command[3];

    let startingIndex: number = 0;
    let endingIndex: number = 0;
    let responseArr: StreamEntry[] = [];

    const stream: Stream | null = this.getStream(streamKey);
    if (!stream) {
      throw new Error("Stream does not exists");
    }

    stream[1].forEach(([streamEntryID, _], i) => {
      if (
        streamIDStart.includes("-") &&
        streamIDStart !== "-" &&
        streamEntryID === streamIDStart
      ) {
        startingIndex = i;
      } else if (
        streamIDEnd.includes("-") &&
        streamIDEnd !== "-" &&
        streamEntryID === streamIDEnd
      ) {
        endingIndex = i;
      } else if (
        !streamIDEnd.includes("-") &&
        streamEntryID.split("-")[0] === streamIDEnd
      ) {
        endingIndex = i;
      } else if (
        !streamIDStart.includes("-") &&
        streamEntryID.split("-")[0] === streamIDStart
      ) {
        startingIndex = i;
      }
    });

    responseArr = stream[1].slice(
      startingIndex,
      endingIndex ? endingIndex + 1 : stream[1].length,
    );

    console.log("RESPONSE ARR: ", responseArr);
    Response.handle(socket, redisProtocolEncoder.encodeRespArr(responseArr));
  }

  public xRead(socket: net.Socket, command: string[]) {
    const streams: string[] = command.slice(command.indexOf("streams") + 1);
    const boundary: number = streams.length / 2;
    const streamsKeys: string[] = streams.slice(0, boundary);
    const streamsIDs: string[] = streams.slice(boundary, streams.length);

    console.log(streamsKeys);
    console.log(streamsIDs);

    if (command[1] === "block") {
      const timeout: number = Number.parseInt(command[2]);

      if (timeout === 0) {
        this.blockThread(streamsKeys[0], streamsIDs[0], socket);
      } else if (command.at(-1) === "$") {
        Response.handle(socket, redisProtocolEncoder.encodeNullArr());
      } else {
        this.delayResponse(streamsKeys[0], streamsIDs[0], socket, timeout);
      }
    } else {
      const responseArr: Stream[] = [];

      streamsKeys.forEach((sKey, i) => {
        responseArr.push(this.readStream(sKey, streamsIDs[i]));
      });

      console.log("READ RESPONSE: ", responseArr);
      Response.handle(socket, redisProtocolEncoder.encodeRespArr(responseArr));
    }
  }

  public getStream(streamKey: string): Stream | null {
    const stream: Stream | undefined = this.STORED_STREAMS.find(
      ([sKey, _]) => streamKey === sKey,
    );

    return stream || null;
  }

  private readStream(streamKey: string, streamID: string): Stream {
    const stream: Stream | null = this.getStream(streamKey);
    if (!stream) {
      throw new Error("Can't read the given stream");
    }

    const acceptableEntries: StreamEntry[] = [];

    if (streamID !== "$") {
      stream[1].forEach(([sID, sEntry]) => {
        if (
          Number.parseInt(sID.replace("-", "")) >
          Number.parseInt(streamID.replace("-", ""))
        ) {
          acceptableEntries.push([sID, sEntry]);
        }
      });
    } else if (streamID === "$") {
      const topStreamEntry: StreamEntry | undefined = stream[1].pop();
      if (topStreamEntry) {
        acceptableEntries.push(topStreamEntry);
      }
    }

    return [streamKey, acceptableEntries];
  }

  private createStreamID(streamKey: string): string {
    const topStreamEntry: StreamEntry | undefined =
      this.getStreamTopEntry(streamKey);

    let topSeqNum: number = 0;
    let topMs: number = 0;

    if (topStreamEntry) {
      [topMs, topSeqNum] = this.parseMsAndSeqNumFromStreamID(topStreamEntry[0]);
    }

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

  private getStreamTopEntry(streamKey: string): StreamEntry | undefined {
    const stream: Stream | null = this.getStream(streamKey);

    if (stream) {
      return stream[1]?.slice()?.pop();
    } else {
      return undefined;
    }
  }

  private parseMsAndSeqNumFromStreamID(streamID: string): number[] {
    const [ms, seqNum]: string[] = streamID.split("-");
    return [Number.parseInt(ms), Number.parseInt(seqNum)];
  }

  private checkStreamValidity(
    streamID: string,
    streamKey: string,
    containsKeyValP: boolean,
  ): string {
    const [ms, seqNum]: string[] = streamID.split("-");

    let topSeqNum: number = 0;
    let topMs: number = 0;
    const topStreamEntry: StreamEntry | undefined =
      this.getStreamTopEntry(streamKey);

    if (topStreamEntry) {
      [topMs, topSeqNum] = this.parseMsAndSeqNumFromStreamID(topStreamEntry[0]);
    }

    if (
      Number.parseInt(ms) === 0 &&
      Number.parseInt(seqNum) === 0 &&
      containsKeyValP
    ) {
      return redisProtocolEncoder.encodeSimpleError(
        "ERR The ID specified in XADD must be greater than 0-0",
      );
    }

    if (topStreamEntry && seqNum !== "*") {
      if (topMs > Number.parseInt(ms)) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item",
        );
      } else if (
        topMs === Number.parseInt(ms) &&
        topSeqNum >= Number.parseInt(seqNum)
      ) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item",
        );
      } else if (
        Number.parseInt(ms) > topMs &&
        Number.parseInt(seqNum) < topSeqNum
      ) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item",
        );
      }
    } else if (topStreamEntry && seqNum === "*") {
      if (topMs > Number.parseInt(ms)) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item",
        );
      }
    }

    return "";
  }

  private parseStreamID(streamID: string, streamKey: string): number[] {
    try {
      const [val1, val2]: string[] = streamID.split("-");
      const streamIDMilliSecondsTime: number = Number.parseInt(val1);
      let sequenceNumber: number;

      if (val2 === "*") {
        const topStreamEntry: StreamEntry | undefined =
          this.getStreamTopEntry(streamKey);
        let topSeqNum: number = 0;
        let topMs: number = 0;

        if (topStreamEntry) {
          [topMs, topSeqNum] = this.parseMsAndSeqNumFromStreamID(
            topStreamEntry[0],
          );
        }

        sequenceNumber =
          topStreamEntry &&
          topSeqNum !== undefined &&
          topMs === streamIDMilliSecondsTime
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

  private storeStream(streamKey: string, streamEntry: StreamEntry): void {
    const stream: Stream | null = this.getStream(streamKey);

    if (stream) {
      stream[1].push(streamEntry);
    } else {
      this.STORED_STREAMS.push([streamKey, [streamEntry]]);
    }

    console.log(this.STORED_STREAMS);
  }

  private delayResponse(
    streamKey: string,
    streamID: string,
    socket: net.Socket,
    timeout: number,
  ): void {
    setTimeout(() => {
      const responseArr: Stream[] = [];
      responseArr.push(this.readStream(streamKey, streamID));

      const isNullStream: boolean = this.isNullStream(responseArr[0]);

      console.log("READ RESPONSE: ", responseArr);

      if (isNullStream) {
        Response.handle(socket, redisProtocolEncoder.encodeNullArr());
      } else {
        Response.handle(
          socket,
          redisProtocolEncoder.encodeRespArr(responseArr),
        );
      }
    }, timeout);
  }

  private isNullStream(stream: Stream): boolean {
    if (!stream[1] || stream[1].length === 0) {
      return true;
    } else {
      return false;
    }
  }

  private blockThread(
    streamKey: string,
    streamID: string,
    socket: net.Socket,
  ): void {
    this.streamAdded$
      .pipe(
        take(1),
        tap(() => {
          const response: Stream = this.readStream(streamKey, streamID);

          const isNullStream: boolean = this.isNullStream(response);

          if (isNullStream) {
            Response.handle(socket, redisProtocolEncoder.encodeNullArr());
          } else {
            Response.handle(
              socket,
              redisProtocolEncoder.encodeRespArr([response]),
            );
          }
        }),
      )
      .subscribe();
  }
}

const streams: Streams = new Streams();
export { streams };
