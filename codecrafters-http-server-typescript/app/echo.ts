import { ALLOWED_COMPRESSION_METHODS } from "./constants";
import { Headers } from "./headers";
import * as zlib from "zlib";

export class Echo {
  public static response(request: Buffer): Buffer {
    const requestTarget: string = request.toString().split(" ")[1];
    const echoString: string = requestTarget.split("/").slice(2).join("/");

    let headers: string = "HTTP/1.1 200 OK\r\n";
    let body: Buffer = Buffer.from(echoString, "utf8");

    const compressMethodsArr: string[] = this.getCompressMethods(request);
    if (compressMethodsArr.includes("gzip")) {
      body = zlib.gzipSync(new Uint8Array(body));
      headers += this.addCompressHeader("gzip");
    }

    headers += `Content-Type: text/plain\r\nContent-Length: ${body.length}\r\n`;

    return Buffer.concat([
      new Uint8Array(Headers.createHeader(request, headers)),
      new Uint8Array(body),
    ]);
  }

  private static addCompressHeader(compressMethod: string): string {
    return `Content-Encoding: ${compressMethod}\r\n`;
  }

  private static getCompressMethods(request: Buffer): string[] {
    try {
      const compressMethods: string[] = request
        .toString()
        .split("Accept-Encoding: ")[1]
        .split("\r\n")[0]
        .split(",");

      return compressMethods
        .filter((compressMethod) =>
          ALLOWED_COMPRESSION_METHODS.some(
            (allowedCompressMethod) =>
              allowedCompressMethod === compressMethod.trim()
          )
        )
        .map((method) => method.trim());
    } catch (err) {
      return [];
    }
  }
}
