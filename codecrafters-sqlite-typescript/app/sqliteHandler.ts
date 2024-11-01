import { open } from "fs/promises";
import { constants } from "fs";
import type { BTreePageHeader, SQLiteHeader, SQLiteSchemaCell } from "./models";
import { readVariant } from "./utils";

export const DB_HEADER_SIZE = 100;
export const B_TREE_PAGE_HEADER = 8;
export const CELL_POINTER_SIZE = 2;

export class SQLiteHandler {
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public async getDBFileBufferAtOffset(
    bufferSize: number,
    offset: number
  ): Promise<Uint8Array> {
    const dbFileHandler = await open(this.dbPath, constants.O_RDONLY);
    const buffer = new Uint8Array(bufferSize);
    await dbFileHandler.read(buffer, 0, buffer.length, offset);
    await dbFileHandler.close();

    return buffer;
  }

  public async parseDBHeader(): Promise<SQLiteHeader> {
    const buffer = await this.getDBFileBufferAtOffset(DB_HEADER_SIZE, 0);
    const headerDataView = new DataView(buffer.buffer, 0, buffer.length);

    return {
      "header string": String.fromCharCode(
        ...new Uint8Array(buffer.slice(0, 16))
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
      "reserved for expansion": new Uint8Array(buffer.slice(72, 92)),
      "version valid for number": headerDataView.getUint32(92),
      "sqlite version number": headerDataView.getUint32(96),
    };
  }

  public async parsePageHeader(): Promise<BTreePageHeader> {
    const buffer = await this.getDBFileBufferAtOffset(
      B_TREE_PAGE_HEADER,
      DB_HEADER_SIZE
    );
    const pageHeaderDataView = new DataView(buffer.buffer, 0, buffer.length);

    return {
      "b-tree page type": pageHeaderDataView.getUint8(0),
      "start of first freeblock": pageHeaderDataView.getUint16(1),
      "number of tables": pageHeaderDataView.getUint16(3),
      "start of cell content area": pageHeaderDataView.getUint16(5),
      "number of fragmented free bytes": pageHeaderDataView.getUint8(7),
    };
  }

  public async getCellPointerArray(): Promise<number[]> {
    const pageHeaderObj = await this.parsePageHeader();
    const numberOfTables = pageHeaderObj["number of tables"];
    const cellPointerArr: number[] = [];

    const buffer = await this.getDBFileBufferAtOffset(
      numberOfTables * CELL_POINTER_SIZE,
      DB_HEADER_SIZE + B_TREE_PAGE_HEADER
    );
    for (let i = 0; i < numberOfTables; i++) {
      cellPointerArr.push(
        new DataView(buffer.buffer, 0, buffer.length).getUint16(
          i * CELL_POINTER_SIZE
        )
      );
    }

    return cellPointerArr;
  }

  public parseCell(buffer: Buffer): SQLiteSchemaCell {
    let offset = 0;

    const { result: sizeOfTheRecord, nextByteToRead: sizeOfTheRecordOffset } =
      readVariant(buffer);
    offset += sizeOfTheRecordOffset;

    const { result: rowId, nextByteToRead: rowIdOffset } = readVariant(
      buffer.slice(offset)
    );
    offset += rowIdOffset;

    const {
      result: sizeOfTheRecordHeader,
      nextByteToRead: sizeOfTheRecordHeaderOffset,
    } = readVariant(buffer.slice(offset));
    offset += sizeOfTheRecordHeaderOffset;

    let {
      result: sizeOfSqliteSchemaType,
      nextByteToRead: sizeOfSqliteSchemaTypeOffset,
    } = readVariant(buffer.slice(offset));
    sizeOfSqliteSchemaType = (sizeOfSqliteSchemaType - 13) / 2;
    offset += sizeOfSqliteSchemaTypeOffset;

    let {
      result: sizeOfSqliteSchemaName,
      nextByteToRead: sizeOfSqliteSchemaNameOffset,
    } = readVariant(buffer.slice(offset));
    sizeOfSqliteSchemaName = (sizeOfSqliteSchemaName - 13) / 2;
    offset += sizeOfSqliteSchemaNameOffset;

    let {
      result: sizeOfSqliteSchemaTableName,
      nextByteToRead: sizeOfSqliteSchemaTableNameOffset,
    } = readVariant(buffer.slice(offset));
    sizeOfSqliteSchemaTableName = (sizeOfSqliteSchemaTableName - 13) / 2;
    offset += sizeOfSqliteSchemaTableNameOffset;

    const { result: sqliteRootPage, nextByteToRead: sqliteRootPageOffset } =
      readVariant(buffer.slice(offset));
    offset += sqliteRootPageOffset;

    const {
      result: sizeOfSqliteSchema,
      nextByteToRead: sizeOfSqliteSchemaOffset,
    } = readVariant(buffer.slice(offset));
    offset += sizeOfSqliteSchemaOffset;

    const valueOfSqlSchemaType = buffer
      .slice(offset, offset + sizeOfSqliteSchemaType)
      .toString();
    offset += sizeOfSqliteSchemaType;

    const valueOfSqlSchemaName = buffer
      .slice(offset, offset + sizeOfSqliteSchemaName)
      .toString();
    offset += sizeOfSqliteSchemaName;

    const valueOfSqlSchemaTableName = buffer
      .slice(offset, offset + sizeOfSqliteSchemaTableName)
      .toString();

    return {
      sizeOfTheRecord,
      rowId,
      sizeOfTheRecordHeader,
      sizeOfSqliteSchemaType,
      sizeOfSqliteSchemaName,
      sizeOfSqliteSchemaTableName,
      sqliteRootPage,
      sizeOfSqliteSchema,
      valueOfSqlSchemaType,
      valueOfSqlSchemaName,
      valueOfSqlSchemaTableName,
    };
  }

  public async getTableName() {
    const tableNames: string[] = [];
    const { "database page size": dbPageSize } = await this.parseDBHeader();
    const buffer = Buffer.from(
      await this.getDBFileBufferAtOffset(dbPageSize, 0)
    );
    const cellPointerArr = await this.getCellPointerArray();
    cellPointerArr.forEach((cellPointer) =>
      tableNames.push(
        this.parseCell(buffer.slice(cellPointer)).valueOfSqlSchemaTableName
      )
    );
    console.log(...tableNames);
  }
}
