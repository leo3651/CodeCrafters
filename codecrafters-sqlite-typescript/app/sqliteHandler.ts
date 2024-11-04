import { open } from "fs/promises";
import { constants } from "fs";
import { type BTreePageHeader, type SQLiteHeader } from "./models";
import { readVariant } from "./utils";

export const DB_HEADER_SIZE = 100; // BYTES
export const B_TREE_PAGE_HEADER_SIZE = 8; // BYTES
export const CELL_POINTER_SIZE = 2; // BYTES

export class SQLiteHandler {
  private readonly dbPath: string;
  dbHeader!: SQLiteHeader;
  rootPageHeader!: BTreePageHeader;
  rootCellPointersArr!: number[];
  rootPageBuffer!: Buffer;
  private readyPromise!: Promise<void>;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.readyPromise = this.init();
  }

  private async init() {
    this.dbHeader = await this.parseDBHeader();
    this.rootPageHeader = await this.parsePageHeader(DB_HEADER_SIZE);
    this.rootCellPointersArr = await this.getCellPointerArray(DB_HEADER_SIZE);
    this.rootPageBuffer = Buffer.from(
      await this.getDBFileBufferAtOffset(this.dbHeader["database page size"], 0)
    );
  }

  public async ensureReady() {
    await this.readyPromise;
  }

  private async getDBFileBufferAtOffset(
    bufferSize: number,
    offset: number
  ): Promise<Uint8Array> {
    const dbFileHandler = await open(this.dbPath, constants.O_RDONLY);
    const buffer = new Uint8Array(bufferSize);

    await dbFileHandler.read(buffer, 0, buffer.length, offset);
    await dbFileHandler.close();

    return buffer;
  }

  private async parseDBHeader(): Promise<SQLiteHeader> {
    const dbHeaderBuffer = await this.getDBFileBufferAtOffset(
      DB_HEADER_SIZE,
      0
    );

    const headerDataView = new DataView(
      dbHeaderBuffer.buffer,
      0,
      dbHeaderBuffer.length
    );

    return {
      "header string": String.fromCharCode(
        ...new Uint8Array(dbHeaderBuffer.slice(0, 16))
      ),
      "database page size": headerDataView.getUint16(16),
      "file format write version": headerDataView.getUint8(18),
      "file format read version": headerDataView.getUint8(19),
      "reserved space at end of each page": headerDataView.getUint8(20),
      "maximum embedded payload fraction": headerDataView.getUint8(21),
      "minimum embedded payload fraction": headerDataView.getUint8(22),
      "leaf payload fraction": headerDataView.getUint8(23),
      "file change counter": headerDataView.getUint32(24),
      "number of pages": headerDataView.getUint32(28),
      "first freelist trunk page": headerDataView.getUint32(32),
      "total freelist pages": headerDataView.getUint32(36),
      "schema cookie": headerDataView.getUint32(40),
      "schema format number": headerDataView.getUint32(44),
      "default page cache size": headerDataView.getUint32(48),
      "largest root b-tree page number": headerDataView.getUint32(52),
      "database text encoding": headerDataView.getUint32(56),
      "user version": headerDataView.getUint32(60),
      "incremental vacuum mode": headerDataView.getUint32(64),
      "application ID": headerDataView.getUint32(68),
      "reserved for expansion": new Uint8Array(dbHeaderBuffer.slice(72, 92)),
      "version valid for number": headerDataView.getUint32(92),
      "sqlite version number": headerDataView.getUint32(96),
    };
  }

  private async parsePageHeader(offset: number): Promise<BTreePageHeader> {
    const pageHeaderBuffer = await this.getDBFileBufferAtOffset(
      B_TREE_PAGE_HEADER_SIZE,
      offset
    );
    const pageHeaderDataView = new DataView(
      pageHeaderBuffer.buffer,
      0,
      pageHeaderBuffer.length
    );

    return {
      "b-tree page type": pageHeaderDataView.getUint8(0),
      "start of first freeblock": pageHeaderDataView.getUint16(1),
      "number of cells": pageHeaderDataView.getUint16(3),
      "number of tables": pageHeaderDataView.getUint16(3),
      "start of cell content area": pageHeaderDataView.getUint16(5),
      "number of fragmented free bytes": pageHeaderDataView.getUint8(7),
    };
  }

  private async getCellPointerArray(
    pageHeaderOffset: number
  ): Promise<number[]> {
    const { "number of cells": numberOfCells } = await this.parsePageHeader(
      pageHeaderOffset
    );
    const cellPointerArr: number[] = [];

    const cellPointerBuffer = await this.getDBFileBufferAtOffset(
      numberOfCells * CELL_POINTER_SIZE,
      pageHeaderOffset + B_TREE_PAGE_HEADER_SIZE
    );

    for (let i = 0; i < numberOfCells; i++) {
      cellPointerArr.push(
        new DataView(
          cellPointerBuffer.buffer,
          0,
          cellPointerBuffer.length
        ).getUint16(i * CELL_POINTER_SIZE)
      );
    }

    return cellPointerArr;
  }

  public async getTableNames() {
    const tableNames: string[] = [];

    this.rootCellPointersArr.forEach((cellPointer) =>
      tableNames.push(this.parseCell(this.rootPageBuffer.slice(cellPointer))[2])
    );
    console.log(...tableNames);
  }

  public async getTableRowCount(tableName: string): Promise<number> {
    await this.ensureReady();

    const matchedPointer = this.rootCellPointersArr.find(
      (cellPointer) =>
        this.parseCell(this.rootPageBuffer.slice(cellPointer))[2] === tableName
    );

    if (matchedPointer) {
      const tablePageIndex =
        parseInt(this.parseCell(this.rootPageBuffer.slice(matchedPointer))[3]) -
        1;

      const tablePageHeader = await this.parsePageHeader(
        this.dbHeader["database page size"] * tablePageIndex
      );

      return tablePageHeader["number of cells"];
    }

    throw new Error(`Table ${tableName} not found`);
  }

  public async getColumnIndex(
    tableName: string,
    columnName: string
  ): Promise<number> {
    await this.ensureReady();

    // Find the table
    const matchedPointer = this.rootCellPointersArr.find(
      (cellPointer) =>
        this.parseCell(this.rootPageBuffer.slice(cellPointer))[2] ===
        tableName.trim()
    );
    if (!matchedPointer) throw new Error(`Table ${tableName} not found`);

    // Get column order
    const createTableSQL = this.parseCell(
      this.rootPageBuffer.slice(matchedPointer)
    )[4];
    const columnDefs = createTableSQL
      .split("(")[1]
      .split(")")[0]
      .split(",")
      .map((colDef) => colDef.trim().split(" ")[0]);

    const columnIndex = columnDefs?.indexOf(columnName.trim());
    if (columnIndex === -1 || columnIndex === undefined)
      throw new Error(`Column ${columnName} not found in table ${tableName}`);

    return columnIndex;
  }

  public async getTableData(tableName: string): Promise<string[][]> {
    await this.ensureReady();

    // Locate the specified table's page index
    const matchedPointer = this.rootCellPointersArr.find((cellPointer) => {
      return (
        this.parseCell(this.rootPageBuffer.slice(cellPointer))[2] ===
        tableName.trim()
      );
    });
    if (!matchedPointer) throw new Error(`Table ${tableName} not found`);

    let tablePageIndex =
      parseInt(this.parseCell(this.rootPageBuffer.slice(matchedPointer))[3]) -
      1;

    // Get column index
    //const columnIndex = await this.getColumnIndex(tableName, columnName);

    const pageWithDataOffset =
      this.dbHeader["database page size"] * tablePageIndex;
    const rowCellPointers = await this.getCellPointerArray(pageWithDataOffset);
    const rowDataBuffer = Buffer.from(
      await this.getDBFileBufferAtOffset(
        this.dbHeader["database page size"],
        this.dbHeader["database page size"] * tablePageIndex
      )
    );

    const columnData: string[][] = [];
    for (const rowPointer of rowCellPointers) {
      const rowBuffer = rowDataBuffer.slice(rowPointer);
      const rowData = this.parseCell(rowBuffer);
      columnData.push(rowData);
    }

    return columnData;
  }

  private parseCell(buffer: Buffer): string[] {
    let offset = 0;

    // Step 1: Read payload size (varint)
    const { result: payloadSize, bytesRead: payloadSizeBytes } = readVariant(
      buffer.slice(offset)
    );
    offset += payloadSizeBytes;

    // Step 2: Read row ID (varint)
    const { result: rowId, bytesRead: rowIdBytes } = readVariant(
      buffer.slice(offset)
    );
    offset += rowIdBytes;

    // Step 3: Read header size (varint)
    const { result: headerSize, bytesRead: headerSizeBytes } = readVariant(
      buffer.slice(offset)
    );
    offset += headerSizeBytes;

    // Step 4: Parse serial types in the header
    const serialTypes: number[] = [];
    let headerRemainingBytes = headerSize - headerSizeBytes;
    while (headerRemainingBytes > 0) {
      const { result: serialType, bytesRead: serialTypeBytes } = readVariant(
        buffer.slice(offset)
      );
      serialTypes.push(serialType);
      offset += serialTypeBytes;
      headerRemainingBytes -= serialTypeBytes;
    }

    // Step 5: Parse data
    const data = [];
    for (let i = 0; i < serialTypes.length; i++) {
      const columnSize = this.getSerialTypeSize(serialTypes[i]);
      data.push(
        this.parseSerialTypeValue(
          buffer.slice(offset, offset + columnSize),
          serialTypes[i]
        )
      );
      offset += columnSize;
    }

    return data;
  }

  /**
   * Determines the byte size of a column based on its serial type.
   */
  getSerialTypeSize = (serialType: number): number => {
    if (serialType === 0) return 0; // NULL
    if (serialType === 1) return 1; // 8-bit integer
    if (serialType === 2) return 2; // 16-bit integer
    if (serialType === 3) return 3; // 24-bit integer
    if (serialType === 4) return 4; // 32-bit integer
    if (serialType === 5) return 6; // 48-bit integer
    if (serialType === 6) return 8; // 64-bit integer
    if (serialType === 7) return 8; // 64-bit float
    if (serialType === 8 || serialType === 9) return 0; // Reserved integers 0 or 1
    if (serialType >= 12 && serialType % 2 === 0) return (serialType - 12) / 2; // BLOB
    if (serialType >= 13 && serialType % 2 === 1) return (serialType - 13) / 2; // Text
    return 0;
  };

  parseSerialTypeValue(buffer: Buffer, targetSerialType: number): string {
    // Parse value based on serial type
    if (targetSerialType >= 13 && targetSerialType % 2 === 1) {
      // Text
      return buffer.toString("utf-8");
    } else if (targetSerialType >= 12 && targetSerialType % 2 === 0) {
      // BLOB
      return buffer.toString("hex");
    } else if (targetSerialType === 1) {
      return buffer.readInt8(0).toString();
    } else if (targetSerialType === 2) {
      return buffer.readInt16BE(0).toString();
    } else if (targetSerialType === 3) {
      return buffer.readIntBE(0, 3).toString();
    } else if (targetSerialType === 4) {
      return buffer.readInt32BE(0).toString();
    } else if (targetSerialType === 5) {
      return buffer.readIntBE(0, 6).toString();
    } else if (targetSerialType === 6) {
      return buffer.readBigInt64BE(0).toString();
    } else if (targetSerialType === 7) {
      return buffer.readDoubleBE(0).toString();
    } else if (targetSerialType === 8 || targetSerialType === 9) {
      return "0";
    } else {
      return "null";
    }
  }
}
