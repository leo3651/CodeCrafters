import type { IStream, IStreamEntry } from "./model";
import { redisProtocolEncoder } from "./redisProtocolEncoder";

class StreamHandler {
  STORED_STREAMS: IStream[] = [];
  public newEntry = false;

  constructor() {}

  public getStream(streamKey: string): IStream | null {
    const stream = this.STORED_STREAMS.find(([sKey, _]) => streamKey === sKey);

    return stream || null;
  }

  public readStream(streamKey: string, streamID: string): IStream {
    const stream = this.getStream(streamKey);
    if (!stream) {
      throw new Error("Can't read the given stream");
    }

    const acceptableEntries: IStreamEntry[] = [];

    if (streamID !== "$") {
      stream[1].forEach(([sID, sEntry]) => {
        if (
          Number.parseInt(sID.replace("-", "")) >
          Number.parseInt(streamID.replace("-", ""))
        ) {
          acceptableEntries.push([sID, sEntry]);
        }
      });
    } else if (this.newEntry && streamID === "$") {
      this.newEntry = false;
      const topStreamEntry = stream[1].pop();
      if (topStreamEntry) {
        acceptableEntries.push(topStreamEntry);
      }
    }

    return [streamKey, acceptableEntries];
  }

  public isNullStream(stream: IStream): boolean {
    if (!stream[1] || stream[1].length === 0) {
      return true;
    } else {
      return false;
    }
  }

  public addStream(streamKey: string, streamEntry: IStreamEntry): void {
    const stream = this.getStream(streamKey);

    if (stream) {
      stream[1].push(streamEntry);
    } else {
      this.STORED_STREAMS.push([streamKey, [streamEntry]]);
    }

    console.log(this.STORED_STREAMS);
  }

  public getStreamTopEntry(streamKey: string): IStreamEntry | undefined | null {
    const stream = this.getStream(streamKey);

    if (stream) {
      return stream[1]?.slice()?.pop();
    } else {
      return null;
    }
  }

  public xRange(
    streamKey: string,
    streamIDStart: string,
    streamIDEnd: string
  ): IStreamEntry[] {
    let startingIndex = 0;
    let endingIndex = 0;
    let responseArr = [];

    const stream = this.getStream(streamKey);
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
      endingIndex ? endingIndex + 1 : stream[1].length
    );

    console.log("RESPONSE ARR: ", responseArr);

    return responseArr;
  }

  public parseStreamID(streamID: string, streamKey: string): number[] {
    try {
      const [val1, val2] = streamID.split("-");
      const streamIDMilliSecondsTime = Number.parseInt(val1);
      let sequenceNumber: number;

      if (val2 === "*") {
        const topStreamEntry = this.getStreamTopEntry(streamKey);
        let topSeqNum = 0;
        let topMs = 0;

        if (topStreamEntry) {
          [topMs, topSeqNum] = this.parseMsAndSeqNum(topStreamEntry[0]);
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

  private parseMsAndSeqNum(streamID: string): number[] {
    const [ms, seqNum] = streamID.split("-");
    return [Number.parseInt(ms), Number.parseInt(seqNum)];
  }

  public checkStreamValidity(
    streamID: string,
    streamKey: string,
    containsKeyValP: boolean
  ): string | null {
    const [ms, seqNum] = streamID.split("-");

    let topSeqNum = 0;
    let topMs = 0;
    const topStreamEntry = this.getStreamTopEntry(streamKey);

    if (topStreamEntry) {
      [topMs, topSeqNum] = this.parseMsAndSeqNum(topStreamEntry[0]);
    }

    if (
      Number.parseInt(ms) === 0 &&
      Number.parseInt(seqNum) === 0 &&
      containsKeyValP
    ) {
      return redisProtocolEncoder.encodeSimpleError(
        "ERR The ID specified in XADD must be greater than 0-0"
      );
    }

    if (topStreamEntry && seqNum !== "*") {
      if (topMs > Number.parseInt(ms)) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item"
        );
      } else if (
        topMs === Number.parseInt(ms) &&
        topSeqNum >= Number.parseInt(seqNum)
      ) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item"
        );
      } else if (
        Number.parseInt(ms) > topMs &&
        Number.parseInt(seqNum) < topSeqNum
      ) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item"
        );
      }
    } else if (topStreamEntry && seqNum === "*") {
      if (topMs > Number.parseInt(ms)) {
        return redisProtocolEncoder.encodeSimpleError(
          "ERR The ID specified in XADD is equal or smaller than the target stream top item"
        );
      }
    }

    return null;
  }

  public createStreamID(streamKey: string): string {
    const topStreamEntry = this.getStreamTopEntry(streamKey);

    let topSeqNum = 0;
    let topMs = 0;

    if (topStreamEntry) {
      [topMs, topSeqNum] = this.parseMsAndSeqNum(topStreamEntry[0]);
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
}

const streamHandler = new StreamHandler();
export { streamHandler };
