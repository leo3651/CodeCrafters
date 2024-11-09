import { SQLiteHandler } from "./sqliteHandler";
import fs from "fs";

const args = process.argv;
const databaseFilePath: string = args[2];
const command: string = args[3];

const sqliteHandler = new SQLiteHandler(databaseFilePath);
await sqliteHandler.ensureReady();

// .dbinfo ARG
if (command === ".dbinfo") {
  console.log("\nDATABASE HEADER");
  Object.entries(sqliteHandler.dbHeader).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });

  console.log("\nROOT PAGE HEADER");
  Object.entries(sqliteHandler.rootPageHeader).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
}

// .tables ARG - prints the names of all tables
else if (command === ".tables") {
  console.log(...(await sqliteHandler.getTableNames()));
}

// Count rows in the table
else if (command.toLowerCase().includes("select count(*)")) {
  const queryTable = command.split(" ").at(-1) || "";

  const rowCount = await sqliteHandler.getTableRowCount(queryTable);

  console.log(rowCount);
}

// Select rows from columns
else if (command.toLowerCase().startsWith("select")) {
  let whereColumn = "";
  let whereTerm = "";
  let whereColumnIndex: number = 0;

  let [rest, tableName] = command.toLowerCase().split(" from ");
  const columnNames = rest.toLowerCase().split("select ")[1].split(",");

  if (command.toLowerCase().includes("where")) {
    const _tableName = tableName.toLowerCase().split("where")[0];
    whereColumn = tableName.toLowerCase().split("where")[1].split("=")[0];
    whereTerm = command
      .split("=")[1]
      .trim()
      .slice(1, whereTerm.length - 1);
    tableName = _tableName;
    whereColumnIndex = await sqliteHandler.getColumnIndex(
      tableName,
      whereColumn
    );
  }

  if (!tableName || !columnNames.length) {
    throw new Error("Invalid query format");
  }

  const columnData = await sqliteHandler.getTableData(tableName);
  if (columnData !== null) {
    const columnIndexes: number[] = [];
    for (const columnName of columnNames) {
      columnIndexes.push(
        await sqliteHandler.getColumnIndex(tableName, columnName)
      );
    }

    for (let j = 0, m = columnData.length; j < m; j++) {
      let data = "";
      for (let i = 0, n = columnIndexes.length; i < n; i++) {
        if (!whereColumn) {
          data += `|${columnData[j][columnIndexes[i]]}`;
        } else {
          if (columnData[j][whereColumnIndex] === whereTerm) {
            data += `|${columnData[j][columnIndexes[i]]}`;
          }
        }
      }
      if (data) {
        console.log(data.slice(1));
      }
    }
  }
}

// Handle unknown commands
else {
  throw new Error(`Unknown command ${command}`);
}
