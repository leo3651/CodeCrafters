class RedisProtocolEncoder {
  public encodeBulkString(data: string): string {
    return `$${data.length}\r\n${data}\r\n`;
  }

  public encodeSimpleString(data: string): string {
    return `+${data}\r\n`;
  }

  public nullBulkString(): string {
    return "$-1\r\n";
  }

  public encodeArrWithBulkStrings(strArr: string[]): string {
    let output = `*${strArr.length}\r\n`;
    for (let i = 0; i < strArr.length; i++) {
      output += this.encodeBulkString(strArr[i]);
    }

    return output;
  }
}

const redisProtocolEncoder = new RedisProtocolEncoder();
export { redisProtocolEncoder };
