class RedisProtocolEncoder {
  public encodeBulkString(data: string): string {
    return `$${data.length}\r\n${data}\r\n`;
  }

  public encodeSimpleString(data: string): string {
    return `+${data}\r\n`;
  }

  public encodeSimpleError(data: string): string {
    return `-${data}\r\n`;
  }

  public nullBulkString(): string {
    return "$-1\r\n";
  }

  public encodeNumber(data: string): string {
    return `:${data}\r\n`;
  }

  public encodeArrWithBulkStrings(strArr: string[]): string {
    let output = `*${strArr.length}\r\n`;
    for (let i = 0; i < strArr.length; i++) {
      output += this.encodeBulkString(strArr[i]);
    }

    return output;
  }

  public encodeRespArr(arr: any[]): string {
    let finalString = "";
    finalString += `*${arr.length}\r\n`;

    for (let i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        finalString += this.encodeRespArr(arr[i]);
      } else if (typeof arr[i] === "string") {
        finalString += this.encodeBulkString(arr[i]);
      }
    }

    return finalString;
  }
}

const redisProtocolEncoder = new RedisProtocolEncoder();
export { redisProtocolEncoder };
