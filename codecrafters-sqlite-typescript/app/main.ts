import { Column } from "./column";
import { DB_HEADER_SIZE } from "./constants";
import { Headers } from "./headers";
import { ERootPageCellData } from "./models";
import { Tables } from "./tables";

const args: string[] = process.argv;
const command: string = args[3];

// .dbinfo ARG
if (command === ".dbinfo") {
  console.log("\nDATABASE HEADER\n");
  Object.entries(await Headers.getDbHeader()).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });

  console.log("\nROOT PAGE HEADER");
  Object.entries(await Headers.getPageHeaderAtOffset(DB_HEADER_SIZE)).forEach(
    ([key, value]) => {
      console.log(`${key}: ${value}`);
    },
  );
}

// .tables ARG - prints the names of all tables
else if (command === ".tables") {
  console.log(...(await Tables.getNames()));
}

// Count rows in the table
else if (command.toLowerCase().includes("select count(*)")) {
  const tableName: string = command.split(" ").at(-1) || "";

  console.log(await Tables.getTableRowCount(tableName));
}

// Select rows from columns
else {
  const words: string[] = command.replaceAll(",", "").split(" ");
  const indexOfSelect: number = words
    .map((word) => word.toLowerCase())
    .indexOf("select");
  const indexOfWhere: number = words
    .map((word) => word.toLowerCase())
    .indexOf("where");
  const indexOfFrom: number = words
    .map((word) => word.toLowerCase())
    .indexOf("from");

  const columns: string[] = words.slice(indexOfSelect + 1, indexOfFrom);
  const table: string = words[indexOfFrom + 1];
  let whereColumn: string = "";
  let whereCondition: string = "";

  if (indexOfWhere > -1) {
    whereColumn = words[indexOfWhere + 1];
    whereCondition = command.split("'")[1];
  }
  let tableRootPageIndex: number = -1;
  let indexTableRootPageIndex: number = -1;

  const tableRootData: string[] | null = await Tables.getTableRootData(table);
  if (tableRootData) {
    tableRootPageIndex =
      parseInt(tableRootData[ERootPageCellData.schemaRootPage]) - 1;
  }
  const indexTableData: string[] | null = await Column.checkForIndexSearch(
    table,
    whereColumn,
  );
  if (indexTableData) {
    indexTableRootPageIndex =
      Number.parseInt(indexTableData[ERootPageCellData.schemaRootPage]) - 1;
  }
  const columnIndices: number[] = await Promise.all(
    columns.map(async (column) => await Column.getColumnIndex(table, column)),
  );
  const whereColumnIndex: number = await Column.getColumnIndex(
    table,
    whereColumn,
  );

  const rows: string[][] = await Tables.getTableData(
    tableRootPageIndex,
    indexTableRootPageIndex,
    whereColumnIndex,
    whereCondition,
    columnIndices,
  );
  rows.forEach((row) => console.log(...row));
}
