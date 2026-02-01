import { TableLeafCell } from "./cell";
import { CellPointers } from "./cellPointers";
import { DB_HEADER_SIZE } from "./constants";
import { ERootPageCellData } from "./models";
import { Page } from "./page";
import { Tables } from "./tables";

export class Column {
  public static async getColumnIndex(
    tableName: string,
    columnName: string,
  ): Promise<number> {
    if (!tableName || !columnName) {
      return -1;
    }

    let sqlSchema: string = "";

    const tableRootData: string[] | null =
      await Tables.getTableRootData(tableName);
    if (tableRootData) {
      sqlSchema = tableRootData[ERootPageCellData.schema];
    }
    if (!sqlSchema) {
      throw new Error(`Can not find column index for ${tableName}`);
    }

    const columnsInTable: string[] = sqlSchema
      .split("(")[1]
      .split(")")[0]
      .split(",")
      .map((colName) => colName.trim().split(" ")[0]);

    const columnIndex: number = columnsInTable?.indexOf(columnName.trim());
    if (columnIndex === -1 || columnIndex === undefined)
      throw new Error(`Column ${columnName} not found in table ${tableName}`);

    return columnIndex;
  }

  public static async checkForIndexSearch(
    tableName: string,
    searchColumn: string | null,
  ): Promise<string[] | null> {
    if (!tableName || !searchColumn) {
      return null;
    }

    const rootCellPointersArr: number[] =
      await CellPointers.getCellPointersForPageAtOffset(DB_HEADER_SIZE);
    const rootPageBuffer: Buffer = await Page.getRootPageBuffer();

    for (const cellPointer of rootCellPointersArr) {
      const cellData: string[] = TableLeafCell.parse(
        rootPageBuffer.subarray(cellPointer),
      ).data;
      const indexedColumn: string[] = cellData[ERootPageCellData.schema]
        ?.split("(")[1]
        ?.split(")")[0]
        ?.split(",")
        ?.map((colName) => colName.trim().split(" ")[0]);

      if (
        cellData[ERootPageCellData.schemaTableName] === tableName.trim() &&
        cellData[ERootPageCellData.schemaType] === "index" &&
        indexedColumn &&
        indexedColumn.length &&
        searchColumn.trim() === indexedColumn[0].trim()
      ) {
        return cellData;
      }
    }

    return null;
  }
}
