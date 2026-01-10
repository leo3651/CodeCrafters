export class Headers {
  public static createHeader(request: Buffer, headers: string): Buffer {
    let headerBuffer: Buffer = Buffer.alloc(0);

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
