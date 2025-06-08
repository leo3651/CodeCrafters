class RedisProtocolParser {
  public readRedisProtocol(data: string): string[][] {
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

  private redisProtocolParser(
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

  private readRedisProtocolLine(
    data: string,
    i: number
  ): { word: string; i: number } {
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
}

const redisProtocolParser = new RedisProtocolParser();
export { redisProtocolParser };
