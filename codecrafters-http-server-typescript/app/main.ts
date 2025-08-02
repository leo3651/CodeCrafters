import * as net from "net";
import fs from "fs";
import * as zlib from "zlib";

const server = net.createServer((socket) => {
  socket.on("data", (request) => {
    new HttpServerHandler(request, socket);
  });
});

server.listen(4221, "localhost");

export class HttpServerHandler {
  private readonly OK = "HTTP/1.1 200 OK\r\n\r\n";
  private readonly NOT_OK = "HTTP/1.1 404 Not Found\r\n\r\n";
  private readonly ALLOWED_COMPRESSION_METHODS = ["gzip"];

  private get requestMethod(): string {
    return this.request.toString().split(" ")[0];
  }
  private get requestTarget(): string {
    return this.request.toString().split(" ")[1];
  }

  constructor(private request: Buffer, socket: net.Socket) {
    const response = this.createResponse();

    console.log(response.toString());
    socket.write(new Uint8Array(response));
    // socket.end();
  }

  private createResponse(): Buffer {
    // "/"
    if (this.requestTarget === "/") {
      return this.OkResponse();
    }

    // Echo
    else if (this.requestTarget.startsWith("/echo")) {
      return this.echoResponse();
    }

    // User agent
    else if (this.requestTarget === "/user-agent") {
      return this.userAgentResponse();
    }

    // Files
    else if (this.requestTarget.startsWith("/files/")) {
      return this.filesResponse();
    }

    // Not Found
    else {
      return Buffer.from(this.NOT_OK);
    }
  }

  private OkResponse(): Buffer {
    return Buffer.from(this.OK);
  }

  private userAgentResponse(): Buffer {
    const userAgentData = Buffer.from(
      this.request.toString().split("User-Agent: ")[1].split("\r\n")[0]
    );

    const headers = Buffer.from(
      `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${userAgentData.length}\r\n\r\n`
    );

    return Buffer.concat([
      new Uint8Array(headers),
      new Uint8Array(userAgentData),
    ]);
  }

  private echoResponse(): Buffer {
    const echoString = this.requestTarget.split("/").slice(2).join("/");
    let responseBuffer = Buffer.from("HTTP/1.1 200 OK\r\n");

    let body: Buffer = Buffer.from(echoString, "utf8");

    const compressMethodsArr = this.checkForCompressHeaders(this.request);

    if (compressMethodsArr.includes("gzip")) {
      body = zlib.gzipSync(new Uint8Array(body));
      console.log("HERE");
      responseBuffer = Buffer.concat([
        new Uint8Array(responseBuffer),
        new Uint8Array(Buffer.from(this.addCompressHeader("gzip"))),
      ]);
    }

    responseBuffer = Buffer.concat([
      new Uint8Array(responseBuffer),
      new Uint8Array(
        Buffer.from(
          `Content-Type: text/plain\r\nContent-Length: ${body.length}\r\n\r\n`
        )
      ),
      new Uint8Array(body),
    ]);

    return responseBuffer;
  }

  private filesResponse(): Buffer {
    const absPath = process.argv[3];
    const fileName = this.requestTarget.split("/")[2];

    //GET
    if (this.requestMethod === "GET") {
      try {
        const fileContent = fs.readFileSync(`${absPath}/${fileName}`);
        const headers = Buffer.from(
          `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileContent.length}\r\n\r\n`
        );

        return Buffer.concat([
          new Uint8Array(headers),
          new Uint8Array(fileContent),
        ]);
      } catch (err) {
        return Buffer.from(this.NOT_OK);
      }
    }

    // POST
    else if (this.requestMethod === "POST") {
      const bodySize: number = parseInt(
        this.request.toString().split("Content-Length: ")[1].split("\r\n")[0]
      );

      const content = this.request.subarray(this.request.length - bodySize);

      try {
        fs.writeFileSync(`${absPath}/${fileName}`, new Uint8Array(content));
        return Buffer.from(`HTTP/1.1 201 Created\r\n\r\n`);
      } catch (err) {
        return Buffer.from(this.NOT_OK);
      }
    }

    throw new Error("Unhandled method");
  }

  private checkForCompressHeaders(request: Buffer): string[] {
    try {
      const compressMethods = request
        .toString()
        .split("Accept-Encoding: ")[1]
        .split("\r\n")[0]
        .split(",");

      return compressMethods
        .filter((compressMethod) =>
          this.ALLOWED_COMPRESSION_METHODS.some(
            (allowedCompressMethod) =>
              allowedCompressMethod === compressMethod.trim()
          )
        )
        .map((method) => method.trim());
    } catch (err) {
      return [];
    }
  }

  private addCompressHeader(compressMethod: string): string {
    return `Content-Encoding: ${compressMethod}\r\n`;
  }
}
