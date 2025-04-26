import * as net from "net";

const CRLF = "\r\n";
const COMMANDS = { echo: true, ping: true };

const server: net.Server = net.createServer((socket: net.Socket) => {
  // Handle connection
  console.log("New client connected");

  socket.on("data", (data) => {
    console.log(
      `Received data from CLIENT: ${JSON.stringify(data.toString())}`
    );
    console.log(redisProtocolParser(data.toString(), 0));

    const [decodedData, _] = redisProtocolParser(data.toString(), 0);
    handleCommand(decodedData, socket);
  });
});

server.listen(6379, "127.0.0.1");

function redisProtocolParser(data: string, offset: number): [string[], number] {
  const type: string = data[offset];
  const words: string[] = [];

  switch (type) {
    case "*":
      offset++;

      const arrLenAsStr = data.slice(offset, data.indexOf(CRLF, offset));
      const arrLen = Number.parseInt(arrLenAsStr);
      offset += arrLenAsStr.length;
      offset += 2;

      for (let i = 0; i < arrLen; i++) {
        const [word, newOffset] = redisProtocolParser(data, offset);
        offset = newOffset;
        words.push(...word);
      }

      return [words, offset];

    case "$":
      const [word, newOffset] = readLine(data, offset);
      words.push(word);
      return [words, newOffset];

    default:
      throw new Error("Unhandled RESP data type");
  }
}

function readLine(data: string, offset: number): [string, number] {
  offset++;
  const firstCRLFIndex = data.indexOf(CRLF, offset);

  if (firstCRLFIndex === -1) {
    throw new Error("Invalid frame");
  }

  const lengthAsStr = data.slice(offset, firstCRLFIndex);
  offset += lengthAsStr.length;
  offset += 2;
  const len = Number.parseInt(lengthAsStr);

  const word = data.slice(offset, offset + len);
  offset += len;
  offset += 2;

  return [word, offset];
}

function handleCommand(decodedData: string[], socket: net.Socket) {
  for (let i = 0; i < decodedData.length; i++) {
    switch (decodedData[i].toLowerCase()) {
      case "echo":
        i++;
        const arg = decodedData[i];
        socket.write(encodeBulkString(arg));
        break;

      case "ping":
        socket.write(encodeBulkString("PONG"));
        break;

      default:
        console.log("Unhandled command");
        break;
    }
  }
}

function encodeBulkString(data: string) {
  return `$${data.length}\r\n${data}\r\n`;
}
