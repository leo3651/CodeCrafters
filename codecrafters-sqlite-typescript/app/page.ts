import {
  IndexInteriorCell,
  IndexLeafCell,
  TableInteriorCell,
  TableLeafCell,
} from "./cell";
import { CellPointers } from "./cellPointers";
import {
  INDEX_INTERIOR,
  INDEX_LEAF,
  TABLE_INTERIOR,
  TABLE_LEAF,
} from "./constants";
import { DBFileReader } from "./dbFileReader";
import { Headers } from "./headers";
import type { IBTreePageHeader, IDBFileHeader, TraversedPage } from "./models";

export class Page {
  private static _rootPageBuffer: null | Buffer = null;
  private static _traversedPages: { [key: string]: TraversedPage } = {};
  public static _data: string[][] = [];

  private static whereCondition: string = "";
  private static indexLeafCells: IndexLeafCell[] = [];

  public static async getRootPageBuffer(): Promise<Buffer> {
    if (this._rootPageBuffer) {
      return this._rootPageBuffer;
    } else {
      const rootPageSize: IDBFileHeader = await Headers.getDbHeader();
      this._rootPageBuffer = Buffer.from(
        await DBFileReader.readNBytesAtOffset(
          rootPageSize["database page size"],
          0,
        ),
      );
      return this._rootPageBuffer;
    }
  }

  public static async traverseBTreePages(
    tableRootPageIndex: number,
    indexTableRootPageIndex: number,
    whereCondition: string,
  ): Promise<string[][]> {
    this.whereCondition = whereCondition;
    if (indexTableRootPageIndex > -1) {
      await this.traverseBTreePage(indexTableRootPageIndex, null);
      for (const indexLeafCell of this.indexLeafCells) {
        await this.traverseBTreePage(tableRootPageIndex, indexLeafCell);
      }
    } else {
      await Page.traverseBTreePage(tableRootPageIndex, null);
    }

    return this._data;
  }

  public static async traverseBTreePage(
    pageIndex: number,
    indexLeafCell: IndexLeafCell | null,
  ) {
    let pageHeaderObj: IBTreePageHeader;
    let pageBuffer: Buffer;
    let cellPointers: number[];

    // CACHED
    if (this._traversedPages[pageIndex]) {
      pageHeaderObj = this._traversedPages[pageIndex].pageHeaderObj;
      pageBuffer = this._traversedPages[pageIndex].pageBuffer;
      cellPointers = this._traversedPages[pageIndex].cellPointers;
    }

    // NOT CACHED
    else {
      const dbHeader: IDBFileHeader = await Headers.getDbHeader();
      pageHeaderObj = await Headers.getPageHeaderAtOffset(
        pageIndex * dbHeader["database page size"],
      );
      pageBuffer = Buffer.from(
        await DBFileReader.readNBytesAtOffset(
          dbHeader["database page size"],
          dbHeader["database page size"] * pageIndex,
        ),
      );
      cellPointers = await CellPointers.getCellPointersForPageAtOffset(
        pageIndex * dbHeader["database page size"],
      );
      this._traversedPages[pageIndex] = {
        pageBuffer,
        pageHeaderObj,
        cellPointers,
      };
    }

    if (
      pageHeaderObj["b-tree page type"] === TABLE_LEAF ||
      pageHeaderObj["b-tree page type"] === TABLE_INTERIOR
    ) {
      await this.traverseBTreePageWithTableCells(
        pageHeaderObj,
        pageBuffer,
        cellPointers,
        indexLeafCell,
      );
    } else {
      await this.traverseBTreePageWithIndexCells(
        pageHeaderObj,
        pageBuffer,
        cellPointers,
      );
    }
  }

  public static async traverseBTreePageWithTableCells(
    pageHeaderObj: IBTreePageHeader,
    pageBuffer: Buffer,
    cellPointers: number[],
    indexLeafCell: IndexLeafCell | null,
  ) {
    // TABLE INTERIOR
    if (pageHeaderObj["b-tree page type"] === TABLE_INTERIOR) {
      if (indexLeafCell) {
        const lastCell: TableInteriorCell = TableInteriorCell.parse(
          pageBuffer.subarray(cellPointers[cellPointers.length - 1]),
        );
        if (indexLeafCell.id <= lastCell.rowId) {
          const cellPointer: number | undefined = cellPointers.find(
            (cellPointer) =>
              TableInteriorCell.parse(pageBuffer.subarray(cellPointer)).rowId >=
              indexLeafCell.id,
          );
          await this.traverseBTreePage(
            TableInteriorCell.parse(pageBuffer.subarray(cellPointer))
              .leftChildPageNumber,
            indexLeafCell,
          );
        } else {
          await this.traverseBTreePage(
            pageHeaderObj["right most pointer"]!,
            indexLeafCell,
          );
        }
      } else {
        for (const cellPointer of cellPointers) {
          const tableInteriorCellData: TableInteriorCell =
            TableInteriorCell.parse(pageBuffer.subarray(cellPointer));
          await this.traverseBTreePage(
            tableInteriorCellData.leftChildPageNumber,
            indexLeafCell,
          );
        }
        await this.traverseBTreePage(
          pageHeaderObj["right most pointer"]!,
          indexLeafCell,
        );
      }
    }

    // TABLE LEAF
    else if (pageHeaderObj["b-tree page type"] === TABLE_LEAF) {
      cellPointers.forEach((cellPointer) => {
        const cellData: string[] = TableLeafCell.parse(
          pageBuffer.subarray(cellPointer),
        ).data;

        if (indexLeafCell) {
          if (indexLeafCell.id === Number.parseInt(cellData[0])) {
            this._data.push(cellData);
          }
        } else {
          this._data.push(cellData);
        }
      });
    }
  }

  public static async traverseBTreePageWithIndexCells(
    pageHeaderObj: IBTreePageHeader,
    pageBuffer: Buffer,
    cellPointers: number[],
  ) {
    // INDEX INTERIOR
    if (pageHeaderObj["b-tree page type"] === INDEX_INTERIOR) {
      const lastCell: IndexInteriorCell = IndexInteriorCell.parse(
        pageBuffer.subarray(cellPointers[cellPointers.length - 1]),
      );

      if (this.whereCondition >= lastCell.indexedValue) {
        await this.traverseBTreePage(
          pageHeaderObj["right most pointer"]!,
          null,
        );
      } else {
        const matchingCellPointers: number[] = cellPointers
          .filter(
            (cellPointer) =>
              IndexInteriorCell.parse(pageBuffer.subarray(cellPointer))
                .indexedValue >= this.whereCondition,
          )
          .slice(0, 2);

        if (matchingCellPointers.length) {
          for (const matchingCellPointer of matchingCellPointers) {
            const cellData: IndexInteriorCell = IndexInteriorCell.parse(
              pageBuffer.subarray(matchingCellPointer),
            );
            if (cellData.indexedValue === this.whereCondition) {
              this.indexLeafCells.push({
                id: Number.parseInt(cellData.id),
                indexedValue: cellData.indexedValue,
              });
            }
            await this.traverseBTreePage(cellData.leftChildPageNumber, null);
          }
        }
      }
    }

    // INDEX LEAF
    else if (pageHeaderObj["b-tree page type"] === INDEX_LEAF) {
      const matchingPointers: number[] = cellPointers.filter(
        (cellPointer) =>
          IndexLeafCell.parse(pageBuffer.subarray(cellPointer)).indexedValue ===
          this.whereCondition,
      );
      matchingPointers.forEach((matchingCellPointer) =>
        this.indexLeafCells.push(
          IndexLeafCell.parse(pageBuffer.subarray(matchingCellPointer)),
        ),
      );
    }
  }
}
