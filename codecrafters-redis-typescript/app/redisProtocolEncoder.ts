class RedisProtocolEncoder {
  public encodeBulkString(data: string | undefined): string {
    if (data) {
      return `$${data.length}\r\n${data}\r\n`;
    } else {
      return this.encodeNullBulkString();
    }
  }

  public encodeSimpleString(data: string): string {
    return `+${data}\r\n`;
  }

  public encodeSimpleError(data: string): string {
    return `-${data}\r\n`;
  }

  public encodeNullBulkString(): string {
    return "$-1\r\n";
  }

  public encodeNullArr(): string {
    return "*-1\r\n";
  }

  public encodeNumber(data: string): string {
    return `:${data}\r\n`;
  }

  public encodeRespArr(arr: any[]): string {
    let finalString: string = `*${arr.length}\r\n`;

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

const redisProtocolEncoder: RedisProtocolEncoder = new RedisProtocolEncoder();
export { redisProtocolEncoder };
