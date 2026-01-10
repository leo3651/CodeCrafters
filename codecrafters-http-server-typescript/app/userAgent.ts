import { Headers } from "./headers";

export class UserAgent {
  public static response(request: Buffer): Buffer {
    const body: Buffer = Buffer.from(
      request.toString().split("User-Agent: ")[1].split("\r\n")[0]
    );
    const headers: Buffer = Headers.createHeader(
      request,
      `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\n`
    );

    return Buffer.concat([new Uint8Array(headers), new Uint8Array(body)]);
  }
}
