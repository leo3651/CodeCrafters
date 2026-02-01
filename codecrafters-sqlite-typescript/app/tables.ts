import { TableLeafCell } from "./cell";
import { CellPointers } from "./cellPointers";
import { DB_HEADER_SIZE } from "./constants";
import { Headers } from "./headers";
import {
  ERootPageCellData,
  type IBTreePageHeader,
  type IDBFileHeader,
} from "./models";
import { Page } from "./page";

export class Tables {
  public static async getNames(): Promise<string[]> {
    const tableNames: string[] = [];

    const rootCellPointersArr: number[] =
      await CellPointers.getCellPointersForPageAtOffset(DB_HEADER_SIZE);

    const rootPageBuffer: Buffer = await Page.getRootPageBuffer();

    rootCellPointersArr.forEach((cellPointer) =>
      tableNames.push(
        TableLeafCell.parse(rootPageBuffer.subarray(cellPointer)).data[
          ERootPageCellData.schemaTableName
        ],
      ),
    );

    return tableNames;
  }

  public static async getTableRowCount(tableName: string): Promise<number> {
    let tablePageIndex: number = -1;

    const tableRootData: string[] | null =
      await this.getTableRootData(tableName);
    if (tableRootData) {
      tablePageIndex =
        parseInt(tableRootData[ERootPageCellData.schemaRootPage]) - 1;
    }

    if (tablePageIndex === -1) {
      throw new Error(`Table ${tableName} not found`);
    }

    const dbFileHeader: IDBFileHeader = await Headers.getDbHeader();
    const tablePageHeader: IBTreePageHeader =
      await Headers.getPageHeaderAtOffset(
        dbFileHeader["database page size"] * tablePageIndex,
      );

    return tablePageHeader["number of cells"];
  }

  public static async getTableRootData(
    tableName: string,
  ): Promise<string[] | null> {
    const rootCellPointersArr: number[] =
      await CellPointers.getCellPointersForPageAtOffset(DB_HEADER_SIZE);
    const rootPageBuffer: Buffer = await Page.getRootPageBuffer();

    for (const cellPointer of rootCellPointersArr) {
      const cellData: string[] = TableLeafCell.parse(
        rootPageBuffer.subarray(cellPointer),
      ).data;

      if (cellData[ERootPageCellData.schemaTableName] === tableName.trim()) {
        return cellData;
      }
    }

    return null;
  }

  public static async getTableData(
    tableRootPageIndex: number,
    indexTableRootPageIndex: number,
    whereColumnIndex: number,
    whereCondition: string,
    columnIndices: number[],
  ): Promise<string[][]> {
    const rows: string[][] = await Page.traverseBTreePages(
      tableRootPageIndex,
      indexTableRootPageIndex,
      whereCondition,
    );

    return rows
      .filter((row) => {
        if (whereCondition) {
          return whereCondition === row[whereColumnIndex];
        }
        return true;
      })
      .map((row) => {
        let output: string = "";
        columnIndices.forEach((columnIndex) => {
          output += `${row[columnIndex]}|`;
        });
        return [(output = output.slice(0, -1))];
      });
  }
}
