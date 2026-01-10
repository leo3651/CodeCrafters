import fs from "fs";
import { Headers } from "./headers";
import { NOT_OK } from "./constants";

export class Files {
  public static filesResponse(request: Buffer): Buffer {
    const absPath: string = process.argv[3];
    const requestTarget: string = request.toString().split(" ")[1];
    const requestMethod: string = request.toString().split(" ")[0];
    const fileName: string = requestTarget.split("/")[2];

    //GET
    if (requestMethod === "GET") {
      try {
        const fileContent: Buffer = fs.readFileSync(`${absPath}/${fileName}`);
        const headers: Buffer = Headers.createHeader(
          request,
          `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileContent.length}\r\n`
        );

        return Buffer.concat([
          new Uint8Array(headers),
          new Uint8Array(fileContent),
        ]);
      } catch (err) {
        return Headers.createHeader(request, NOT_OK);
      }
    }

    // POST
    else if (requestMethod === "POST") {
      const bodySize: number = parseInt(
        request.toString().split("Content-Length: ")[1].split("\r\n")[0]
      );

      const content: Buffer = request.subarray(request.length - bodySize);

      try {
        fs.writeFileSync(`${absPath}/${fileName}`, new Uint8Array(content));
        return Headers.createHeader(request, `HTTP/1.1 201 Created\r\n`);
      } catch (err) {
        return Headers.createHeader(request, NOT_OK);
      }
    }

    throw new Error("Unhandled method");
  }
}
