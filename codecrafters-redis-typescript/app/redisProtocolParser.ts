class RedisProtocolParser {
  public readCommand(data: string): string[][] {
    let i: number = 0;
    const decodedData: string[][] = [];

    try {
      while (i < data.length - 1) {
        const {
          newDecodedData,
          newIndex,
        }: {
          newDecodedData: string[];
          newIndex: number;
        } = this.parseRedisProtocol(data, i);
        decodedData.push(newDecodedData);
        i = newIndex;
      }

      return decodedData;
    } catch (err) {
      console.log(err);
      return [];
    }
  }

  private parseRedisProtocol(
    data: string,
    i: number,
  ): { newDecodedData: string[]; newIndex: number } {
    const decodedData: string[] = [];

    while (i < data.length - 1) {
      const type: string = data[i];

      // Resp array
      if (type === "*") {
        i++;
        const start: number = i;
        while (data[i] !== "\r") {
          i++;
          if (i >= data.length) {
            throw new Error("Invalid Resp array");
          }
        }

        const size: string = data.slice(start, i);
        i += size.length;
        i++;

        for (let j = 0; j < Number.parseInt(size); j++) {
          const {
            newDecodedData,
            newIndex,
          }: { newDecodedData: string[]; newIndex: number } =
            this.parseRedisProtocol(data, i);
          decodedData.push(...newDecodedData);
          i = newIndex;
        }

        return { newDecodedData: decodedData, newIndex: i };
      }

      // Bulk string
      else if (type === "$") {
        const { word, i: newIndex }: { word: string; i: number } =
          this.parseRedisProtocolLine(data, i);
        i = newIndex;
        decodedData.push(word);
        return { newDecodedData: decodedData, newIndex: i };
      }

      // Simple string
      else if (type === "+") {
        i++;
        const nextCRLF: string = "\r\n";
        const endOfString: number = data.indexOf(nextCRLF, i);
        if (endOfString === -1) {
          throw new Error("Invalid simple string");
        }

        const word: string = data.slice(i, endOfString);
        i += word.length + 2;
        decodedData.push(word);
        return { newDecodedData: decodedData, newIndex: i };
      } else {
        throw new Error("Unhandled Resp type");
      }
    }

    throw new Error("Could not parse correctly");
  }

  private parseRedisProtocolLine(
    data: string,
    i: number,
  ): { word: string; i: number } {
    i++;

    const firstCRLFIndex: number = data.indexOf("\r\n", i);
    if (firstCRLFIndex === -1) {
      throw new Error("Invalid frame");
    }

    const wordLengthAsStr: string = data.slice(i, firstCRLFIndex);
    const wordLength: number = Number.parseInt(wordLengthAsStr);

    i += wordLengthAsStr.length;
    i += 2;

    const word: string = data.slice(i, i + wordLength);

    i += wordLength;

    if (data[i] === "\r") {
      i += 2;
    }

    return { word, i };
  }
}

const redisProtocolParser: RedisProtocolParser = new RedisProtocolParser();
export { redisProtocolParser };
