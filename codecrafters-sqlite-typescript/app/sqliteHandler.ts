import { open } from "fs/promises";
import { constants } from "fs";
import {
  RootPageCellData,
  type BTreePageHeader,
  type DbFileHeader,
} from "./models";
import { getSerialTypeSize, parseSerialTypeValue, readVariant } from "./utils";

export const DB_HEADER_SIZE = 100; // BYTES
export const CELL_POINTER_SIZE = 2; // BYTES

export class SQLiteHandler {
  private readonly dbPath: string;
  dbHeader!: DbFileHeader;
  rootPageHeader!: BTreePageHeader;
  rootCellPointersArr!: number[];
  rootPageBuffer!: Buffer;
  data: string[][] = [];
  private readyPromise!: Promise<void>;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.readyPromise = this.init();
  }

  private async init(): Promise<void> {
    this.dbHeader = await this.parseDBHeader();
    this.rootPageHeader = await this.parsePageHeader(DB_HEADER_SIZE);
    this.rootCellPointersArr = await this.getCellPointerArray(DB_HEADER_SIZE);
    this.rootPageBuffer = Buffer.from(
      await this.getDBFileBufferAtOffset(this.dbHeader["database page size"], 0)
    );
  }

  public async ensureReady(): Promise<void> {
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

  private async parseDBHeader(): Promise<DbFileHeader> {
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

  private async parsePageHeader(
    offset: number
  ): Promise<BTreePageHeader & { BTreePageHeaderSize: number }> {
    let BTreePageHeaderSize = 8;
    const pageHeaderBuffer = await this.getDBFileBufferAtOffset(
      BTreePageHeaderSize,
      offset
    );
    const pageHeaderDataView = new DataView(
      pageHeaderBuffer.buffer,
      0,
      pageHeaderBuffer.length
    );

    if (
      pageHeaderDataView.getUint8(0) === 0x05 ||
      pageHeaderDataView.getUint8(0) === 0x02
    ) {
      BTreePageHeaderSize = 12;
    }

    return {
      "b-tree page type": pageHeaderDataView.getUint8(0),
      "start of first freeblock": pageHeaderDataView.getUint16(1),
      "number of cells": pageHeaderDataView.getUint16(3),
      "number of tables": pageHeaderDataView.getUint16(3),
      "start of cell content area": pageHeaderDataView.getUint16(5),
      "number of fragmented free bytes": pageHeaderDataView.getUint8(7),
      BTreePageHeaderSize,
    };
  }

  private async getCellPointerArray(
    pageHeaderOffset: number
  ): Promise<number[]> {
    const { "number of cells": numberOfCells, BTreePageHeaderSize } =
      await this.parsePageHeader(pageHeaderOffset);
    const cellPointerArr: number[] = [];

    const cellPointerBuffer = await this.getDBFileBufferAtOffset(
      numberOfCells * CELL_POINTER_SIZE,
      pageHeaderOffset + BTreePageHeaderSize
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

  public async getTableNames(): Promise<string[]> {
    await this.ensureReady();

    const tableNames: string[] = [];

    this.rootCellPointersArr.forEach((cellPointer) =>
      tableNames.push(
        this.parseCell(
          this.rootPageBuffer.slice(cellPointer),
          this.rootPageHeader["b-tree page type"]
        )[RootPageCellData.schemaTableName]
      )
    );

    return tableNames;
  }

  public async getTableRowCount(tableName: string): Promise<number> {
    await this.ensureReady();

    let tablePageIndex: number | null = null;
    const cellData = this.matchedTableRootData(tableName);
    if (cellData) {
      tablePageIndex = parseInt(cellData[RootPageCellData.schemaRootPage]) - 1;
    }
    if (tablePageIndex === null) {
      throw new Error(`Table ${tableName} not found`);
    }

    const tablePageHeader = await this.parsePageHeader(
      this.dbHeader["database page size"] * tablePageIndex
    );

    return tablePageHeader["number of cells"];
  }

  private matchedTableRootData(tableName: string): string[] | null {
    for (const cellPointer of this.rootCellPointersArr) {
      const cellData = this.parseCell(
        this.rootPageBuffer.slice(cellPointer),
        this.rootPageHeader["b-tree page type"]
      );

      if (cellData[RootPageCellData.schemaTableName] === tableName.trim()) {
        return cellData;
      }
    }
    return null;
  }

  public async getColumnIndex(
    tableName: string,
    columnName: string
  ): Promise<number> {
    await this.ensureReady();

    let sqlSchema: string | null = null;

    const cellData = this.matchedTableRootData(tableName);
    if (cellData) {
      sqlSchema = cellData[RootPageCellData.schema];
    }
    if (sqlSchema === null) {
      throw new Error(`Can not find column index for ${tableName}`);
    }

    const columnsInTable = sqlSchema
      .split("(")[1]
      .split(")")[0]
      .split(",")
      .map((colName) => colName.trim().split(" ")[0]);

    const columnIndex = columnsInTable?.indexOf(columnName.trim());
    if (columnIndex === -1 || columnIndex === undefined)
      throw new Error(`Column ${columnName} not found in table ${tableName}`);

    return columnIndex;
  }

  public async getTableData(tableName: string): Promise<string[][] | null> {
    await this.ensureReady();

    let tablePageIndex: number | null = null;

    const cellData = this.matchedTableRootData(tableName);
    if (cellData) {
      tablePageIndex = parseInt(cellData[RootPageCellData.schemaRootPage]) - 1;
    }

    if (tablePageIndex === null) {
      throw new Error(`Table ${tableName} not found`);
    }

    await this.traverseBTreePage(tablePageIndex);
    return this.data;
  }

  private async traverseBTreePage(pageIndex: number) {
    const pageHeaderObj = await this.parsePageHeader(
      pageIndex * this.dbHeader["database page size"]
    );
    const pageBuffer = Buffer.from(
      await this.getDBFileBufferAtOffset(
        this.dbHeader["database page size"],
        this.dbHeader["database page size"] * pageIndex
      )
    );
    const cellPointers = await this.getCellPointerArray(
      pageIndex * this.dbHeader["database page size"]
    );

    if (
      pageHeaderObj["b-tree page type"] === 0x05 ||
      pageHeaderObj["b-tree page type"] === 0x02
    ) {
      for (const cellPointer of cellPointers) {
        const nextPageIndex = pageBuffer
          .slice(cellPointer, cellPointer + 4)
          .readUInt32BE(0);
        await this.traverseBTreePage(nextPageIndex);
      }
    } else if (
      pageHeaderObj["b-tree page type"] === 0x0d ||
      pageHeaderObj["b-tree page type"] === 0x0a
    ) {
      cellPointers.forEach((cellPointer) => {
        this.data.push(
          this.parseCell(
            pageBuffer.slice(cellPointer),
            pageHeaderObj["b-tree page type"]
          )
        );
      });
    } else {
      throw new Error("Unsupported page type");
    }
  }

  private parseCell(buffer: Buffer, pageType: number): string[] {
    let offset = 0;

    if (pageType === 0x0d || pageType === 0x0a) {
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
        const columnSize = getSerialTypeSize(serialTypes[i]);
        data.push(
          parseSerialTypeValue(
            buffer.slice(offset, offset + columnSize),
            serialTypes[i],
            rowId
          )
        );
        offset += columnSize;
      }
      //console.log(data);
      return data;
    }
    if (pageType === 0x05) {
      const pageNumberOfLeftChild = buffer.readInt32BE(0);
      const { result: rowId, bytesRead: rowIdBytes } = readVariant(
        buffer.slice(offset)
      );
    }
    throw new Error("Unsupported cell type");
  }
}
