import * as net from "net";
import * as zlib from "zlib";
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
    const { headers, body } = createResponse(
      request.toString(),
      requestTarget,
      reqMethod
    );
    socket.write(headers);
    socket.write(body);
    socket.end();
  });
});

server.listen(4221, "localhost");

function createResponse(
  request: string,
  requestTarget: string,
  reqMethod: string
) {
  if (requestTarget === "/") {
    return { headers: OK, body: "" };
  }

  if (requestTarget.startsWith("/echo")) {
    let stringToReturn = requestTarget.split("/").slice(2).join("/");
    let body: Uint8Array | string = new Uint8Array(
      Buffer.from(stringToReturn, "utf8")
    );
    const compressMethod = checkForCompressHeaders(request);

    if (compressMethod === "gzip") {
      body = new Uint8Array(zlib.gzipSync(body));
    }

    const headers = `HTTP/1.1 200 OK\r\n${
      compressMethod ? addCompressHeaders(compressMethod) : ""
    }Content-Type: text/plain\r\nContent-Length: ${body.length}\r\n\r\n`;

    return { headers, body };
  }

  if (requestTarget === "/user-agent") {
    const userAgentData = request.split("User-Agent: ")[1].split("\r\n")[0];
    const headers = `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${userAgentData.length}\r\n\r\n`;
    return { headers, body: userAgentData };
  }

  if (requestTarget.startsWith("/files/")) {
    const absPath = process.argv[3];
    const fileName = requestTarget.split("/")[2];

    if (reqMethod === "GET") {
      try {
        const fileContent = fs.readFileSync(`${absPath}/${fileName}`, "binary");
        const headers = `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileContent.length}\r\n\r\n`;
        return {
          headers,
          body: fileContent,
        };
      } catch (err) {
        return { headers: NOT_OK, body: "" };
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
        return { headers: `HTTP/1.1 201 Created\r\n\r\n`, body: "" };
      } catch (err) {
        return { headers: NOT_OK, body: "" };
      }
    }
  }

  return { headers: NOT_OK, body: "" };
}

function checkForCompressHeaders(request: string) {
  try {
    const compressMethods = request
      .split("Accept-Encoding: ")[1]
      .split("\r\n")[0]
      .split(",");
    return (
      ALLOWED_COMPRESSION_METHODS.find((method) =>
        compressMethods.some(
          (compressMethod) => compressMethod.trim() === method
        )
      ) || null
    );
  } catch (err) {
    return null;
  }
}

function addCompressHeaders(compressMethod: string) {
  return `Content-Encoding: ${compressMethod}\r\n`;
}
