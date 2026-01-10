import * as net from "net";
import { Headers } from "./headers";
import { Echo } from "./echo";
import { NOT_OK, OK } from "./constants";
import { UserAgent } from "./userAgent";
import { Files } from "./files";

const server: net.Server = net.createServer((socket: net.Socket) => {
  socket.on("data", (request: Buffer) => {
    new HttpServerHandler(request, socket);
  });
});

server.listen(4221, "localhost");

export class HttpServerHandler {
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
      return Echo.response(request);
    }

    // User agent
    else if (this.requestTarget === "/user-agent") {
      return UserAgent.response(request);
    }

    // Files
    else if (this.requestTarget.startsWith("/files/")) {
      return Files.filesResponse(request);
    }

    // Not Found
    else {
      return this.notFoundResponse(request);
    }
  }

  private OkResponse(request: Buffer): Buffer {
    return Headers.createHeader(request, OK);
  }

  private notFoundResponse(request: Buffer): Buffer {
    return Headers.createHeader(request, NOT_OK);
  }
}
