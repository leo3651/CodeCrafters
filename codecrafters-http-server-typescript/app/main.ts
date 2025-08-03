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
  private readonly OK = "HTTP/1.1 200 OK\r\n";
  private readonly NOT_OK = "HTTP/1.1 404 Not Found\r\n";
  private readonly ALLOWED_COMPRESSION_METHODS = ["gzip"];

  private get requestMethod(): string {
    return this.request.toString().split(" ")[0];
  }
  private get requestTarget(): string {
    return this.request.toString().split(" ")[1];
  }

  constructor(private request: Buffer, socket: net.Socket) {
    const response = this.createResponse(request);

    console.log(response.toString());
    socket.write(new Uint8Array(response));

    if (response.toString().includes("Connection: close")) {
      socket.end();
    }
  }

  private createResponse(request: Buffer): Buffer {
    // "/"
    if (this.requestTarget === "/") {
      return this.OkResponse(request);
    }

    // Echo
    else if (this.requestTarget.startsWith("/echo")) {
      return this.echoResponse(request);
    }

    // User agent
    else if (this.requestTarget === "/user-agent") {
      return this.userAgentResponse(request);
    }

    // Files
    else if (this.requestTarget.startsWith("/files/")) {
      return this.filesResponse(request);
    }

    // Not Found
    else {
      return this.notFoundResponse(request);
    }
  }

  private OkResponse(request: Buffer): Buffer {
    return this.createHeader(request, this.OK);
  }

  private notFoundResponse(request: Buffer): Buffer {
    return this.createHeader(request, this.NOT_OK);
  }

  private userAgentResponse(request: Buffer): Buffer {
    const body = Buffer.from(
      this.request.toString().split("User-Agent: ")[1].split("\r\n")[0]
    );
    const headers = this.createHeader(
      request,
      `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\n`
    );

    return Buffer.concat([new Uint8Array(headers), new Uint8Array(body)]);
  }

  private echoResponse(request: Buffer): Buffer {
    const echoString = this.requestTarget.split("/").slice(2).join("/");

    let headers = "HTTP/1.1 200 OK\r\n";
    let body: Buffer = Buffer.from(echoString, "utf8");

    const compressMethodsArr = this.getCompressMethods(request);
    if (compressMethodsArr.includes("gzip")) {
      body = zlib.gzipSync(new Uint8Array(body));
      headers += this.addCompressHeader("gzip");
    }

    headers += `Content-Type: text/plain\r\nContent-Length: ${body.length}\r\n`;

    return Buffer.concat([
      new Uint8Array(this.createHeader(request, headers)),
      new Uint8Array(body),
    ]);
  }

  private filesResponse(request: Buffer): Buffer {
    const absPath = process.argv[3];
    const fileName = this.requestTarget.split("/")[2];

    //GET
    if (this.requestMethod === "GET") {
      try {
        const fileContent = fs.readFileSync(`${absPath}/${fileName}`);
        const headers = this.createHeader(
          request,
          `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileContent.length}\r\n`
        );

        return Buffer.concat([
          new Uint8Array(headers),
          new Uint8Array(fileContent),
        ]);
      } catch (err) {
        return this.createHeader(request, this.NOT_OK);
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
        return this.createHeader(request, `HTTP/1.1 201 Created\r\n`);
      } catch (err) {
        return this.createHeader(request, this.NOT_OK);
      }
    }

    throw new Error("Unhandled method");
  }

  private getCompressMethods(request: Buffer): string[] {
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

  private createHeader(request: Buffer, headers: string): Buffer {
    let headerBuffer = Buffer.alloc(0);

    if (request.toString().includes("Connection: close")) {
      headerBuffer = Buffer.concat([
        new Uint8Array(headerBuffer),
        new Uint8Array(Buffer.from("Connection: close\r\n")),
      ]);
    }

    return Buffer.concat([
      new Uint8Array(Buffer.from(headers)),
      new Uint8Array(headerBuffer),
      new Uint8Array(Buffer.from("\r\n")),
    ]);
  }
}
