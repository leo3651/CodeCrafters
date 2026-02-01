import { open } from "fs/promises";
import { constants } from "fs";
import type { FileHandle } from "fs/promises";

export class DBFileReader {
  private static dbFilePath: string = process.argv[2];

  public static async readNBytesAtOffset(
    size: number,
    offset: number,
  ): Promise<Uint8Array> {
    const dbFileHandler: FileHandle = await open(
      this.dbFilePath,
      constants.O_RDONLY,
    );
    const buffer: Uint8Array = new Uint8Array(size);

    await dbFileHandler.read(buffer, 0, buffer.length, offset);
    await dbFileHandler.close();

    return buffer;
  }
}
