import { DB_HEADER_SIZE, INDEX_LEAF, TABLE_LEAF } from "./constants";
import { DBFileReader } from "./dbFileReader";
import type { IBTreePageHeader, IDBFileHeader } from "./models";

export class Headers {
  constructor() {}

  private static _dbHeader: null | IDBFileHeader = null;
  private static _pageHeader: { [key: string]: IBTreePageHeader } = {};

  public static async getDbHeader(): Promise<IDBFileHeader> {
    if (this._dbHeader === null) {
      this._dbHeader = await this.parseDbFileHeader();
    }

    return this._dbHeader;
  }

  public static async getPageHeaderAtOffset(
    pageHeaderOffset: number,
  ): Promise<IBTreePageHeader> {
    if (this._pageHeader[pageHeaderOffset]) {
      return this._pageHeader[pageHeaderOffset];
    } else {
      this._pageHeader[pageHeaderOffset] =
        await this.parsePageHeader(pageHeaderOffset);
      return this._pageHeader[pageHeaderOffset];
    }
  }

  private static async parseDbFileHeader(): Promise<IDBFileHeader> {
    const dbHeaderBuffer: Uint8Array = await DBFileReader.readNBytesAtOffset(
      DB_HEADER_SIZE,
      0,
    );

    const headerDataView: DataView = new DataView(
      dbHeaderBuffer.buffer,
      0,
      dbHeaderBuffer.length,
    );

    return {
      "header string": String.fromCharCode(
        ...new Uint8Array(dbHeaderBuffer.slice(0, 16)),
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
      "first freeList trunk page": headerDataView.getUint32(32),
      "total freeList pages": headerDataView.getUint32(36),
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

  private static async parsePageHeader(
    offset: number,
  ): Promise<IBTreePageHeader> {
    let BTreePageHeaderSize: number = 12;

    const pageHeaderBuffer: Uint8Array = await DBFileReader.readNBytesAtOffset(
      BTreePageHeaderSize,
      offset,
    );
    const pageHeaderDataView: DataView = new DataView(
      pageHeaderBuffer.buffer,
      0,
      pageHeaderBuffer.length,
    );

    if (
      pageHeaderDataView.getUint8(0) === TABLE_LEAF ||
      pageHeaderDataView.getUint8(0) === INDEX_LEAF
    ) {
      BTreePageHeaderSize = 8;
    }

    return {
      "b-tree page type": pageHeaderDataView.getUint8(0),
      "start of first freeBlock": pageHeaderDataView.getUint16(1),
      "number of cells": pageHeaderDataView.getUint16(3),
      "number of tables": pageHeaderDataView.getUint16(3),
      "start of cell content area": pageHeaderDataView.getUint16(5),
      "number of fragmented free bytes": pageHeaderDataView.getUint8(7),
      "right most pointer":
        BTreePageHeaderSize === 12 ? pageHeaderDataView.getUint32(8) - 1 : null,
      BTreePageHeaderSize,
    };
  }
}
