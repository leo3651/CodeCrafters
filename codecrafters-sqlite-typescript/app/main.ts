import { SQLiteHandler } from "./sqliteHandler";

const args = process.argv;
const databaseFilePath: string = args[2];
const command: string = args[3];

const sqliteHandler = new SQLiteHandler(databaseFilePath);

// .dbinfo ARG
if (command === ".dbinfo") {
  console.log("\nDATABASE HEADER");
  Object.entries(await sqliteHandler.parseDBHeader()).forEach(
    ([key, value]) => {
      console.log(`${key}: ${value}`);
    }
  );

  console.log("\nPAGE HEADER");
  Object.entries(await sqliteHandler.parsePageHeader()).forEach(
    ([key, value]) => {
      console.log(`${key}: ${value}`);
    }
  );
}

// .tables ARG
else if (command === ".tables") {
  await sqliteHandler.getTableName();
}

//
else {
  throw new Error(`Unknown command ${command}`);
}
