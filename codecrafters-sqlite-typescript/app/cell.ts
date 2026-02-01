import type { Variant } from "./models";
import { getSerialTypeSize, parseSerialTypeValue, readVariant } from "./utils";

export class Cell {
  public static parsePayload(
    buffer: Buffer,
    offset: number,
    rowId: number = -99999,
  ): string[] {
    // Read header size (variant)
    const { result: headerSize, bytesRead: headerSizeBytes }: Variant =
      readVariant(buffer.subarray(offset));
    offset += headerSizeBytes;

    // Parse serial types in the header
    const serialTypes: number[] = [];
    let headerRemainingBytes: number = headerSize - headerSizeBytes;

    while (headerRemainingBytes > 0) {
      const { result: serialType, bytesRead: serialTypeBytes }: Variant =
        readVariant(buffer.subarray(offset));
      serialTypes.push(serialType);
      offset += serialTypeBytes;
      headerRemainingBytes -= serialTypeBytes;
    }

    // Parse data
    const data: string[] = [];
    for (let i = 0; i < serialTypes.length; i++) {
      const columnSize: number = getSerialTypeSize(serialTypes[i]);
      data.push(
        parseSerialTypeValue(
          buffer.subarray(offset, offset + columnSize),
          serialTypes[i],
          rowId,
        ),
      );
      offset += columnSize;
    }

    return data;
  }
}

export class TableInteriorCell {
  constructor(
    public leftChildPageNumber: number,
    public rowId: number,
  ) {}

  public static parse(buffer: Buffer): TableInteriorCell {
    let offset: number = 4;
    const leftChildPageNumber: number = buffer.readInt32BE(0) - 1;
    const { result: rowId }: Variant = readVariant(buffer.subarray(offset));

    return new TableInteriorCell(leftChildPageNumber, rowId);
  }
}

export class TableLeafCell {
  constructor(public data: string[]) {}

  public static parse(buffer: Buffer): TableLeafCell {
    let offset: number = 0;
    // Step 1: Read payload size (variant)
    const { bytesRead: payloadSizeBytes }: Variant = readVariant(
      buffer.subarray(offset),
    );
    offset += payloadSizeBytes;

    // Step 2: Read row ID (varint)
    const { result: rowId, bytesRead: rowIdBytes }: Variant = readVariant(
      buffer.subarray(offset),
    );
    offset += rowIdBytes;

    return new TableLeafCell(Cell.parsePayload(buffer, offset, rowId));
  }
}

export class IndexInteriorCell {
  constructor(
    public leftChildPageNumber: number,
    public indexedValue: string,
    public id: string,
  ) {}

  public static parse(buffer: Buffer): IndexInteriorCell {
    let offset: number = 4;
    const leftChildPageNumber: number = buffer.readInt32BE(0) - 1;
    const { bytesRead: payloadSizeBytes }: Variant = readVariant(
      buffer.subarray(offset),
    );
    offset += payloadSizeBytes;

    const [indexedValue, id]: string[] = Cell.parsePayload(buffer, offset);

    return new IndexInteriorCell(leftChildPageNumber, indexedValue, id);
  }
}

export class IndexLeafCell {
  constructor(
    public indexedValue: string,
    public id: number,
  ) {}

  public static parse(buffer: Buffer): IndexLeafCell {
    let offset: number = 0;
    const { bytesRead: payloadSizeBytes }: Variant = readVariant(
      buffer.subarray(offset),
    );
    offset += payloadSizeBytes;

    const [indexedValue, id]: string[] = Cell.parsePayload(buffer, offset);

    return new IndexLeafCell(indexedValue, Number.parseInt(id));
  }
}
