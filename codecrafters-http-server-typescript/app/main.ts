import * as net from "net";
import fs from "fs";

const OK = "HTTP/1.1 200 OK\r\n\r\n";
const NOT_OK = "HTTP/1.1 404 Not Found\r\n\r\n";
const ALLOWED_COMPRESSION_METHODS = ["gzip"];

const args = process.argv;

const server = net.createServer((socket) => {
  socket.on("data", (request) => {
    console.log(request.toString());
    const reqMethod = request.toString().split(" ")[0];
    const requestTarget = request.toString().split(" ")[1];
    const response = createResponse(
      request.toString(),
      requestTarget,
      reqMethod
    );
    socket.write(response, (err) => {
      if (err) {
        console.log(
          `Error handling request ${request.toString()} ERROR: ${err}`
        );
      }
    });
    socket.end();
  });
});

server.listen(4221, "localhost");

function createResponse(
  request: string,
  requestTarget: string,
  reqMethod: string
): string {
  if (requestTarget === "/") {
    return OK;
  }

  if (requestTarget.startsWith("/echo")) {
    const compressMethod = checkForCompressHeaders(request);
    const stringToReturn = requestTarget.split("/").slice(2).join("/");

    return `HTTP/1.1 200 OK\r\n${
      compressMethod ? addCompressHeaders(compressMethod) : ""
    }Content-Type: text/plain\r\nContent-Length: ${
      stringToReturn.length
    }\r\n\r\n${stringToReturn}`;
  }

  if (requestTarget === "/user-agent") {
    const userAgentData = request.split("User-Agent: ")[1].split("\r\n")[0];
    return `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${userAgentData.length}\r\n\r\n${userAgentData}`;
  }

  if (requestTarget.startsWith("/files/")) {
    const absPath = process.argv[3];
    const fileName = requestTarget.split("/")[2];

    if (reqMethod === "GET") {
      try {
        const fileContent = fs.readFileSync(`${absPath}/${fileName}`, "binary");
        return `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileContent.length}\r\n\r\n${fileContent}`;
      } catch (err) {
        return NOT_OK;
      }
    }

    if (reqMethod === "POST") {
      const bodySize: number = parseInt(
        request.split("Content-Length: ")[1].split("\r\n")[0]
      );
      const reqBuffer = Buffer.from(request);
      const content = reqBuffer.slice(reqBuffer.length - bodySize).toString();
      try {
        fs.writeFileSync(`${absPath}/${fileName}`, content);
        return `HTTP/1.1 201 Created\r\n\r\n`;
      } catch (err) {
        return NOT_OK;
      }
    }
  }

  return NOT_OK;
}

function checkForCompressHeaders(request: string) {
  try {
    const compressMethod = request
      .split("Accept-Encoding: ")[1]
      .split("\r\n")[0];
    return (
      ALLOWED_COMPRESSION_METHODS.find((method) => method === compressMethod) ||
      null
    );
  } catch (err) {
    return null;
  }
}

function addCompressHeaders(compressMethod: string) {
  return `Content-Encoding: ${compressMethod}\r\n`;
}
