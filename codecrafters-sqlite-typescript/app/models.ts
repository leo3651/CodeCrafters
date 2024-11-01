export interface SQLiteHeader {
  "header string": string; // The header string: "SQLite format 3\000"
  "database page size": number; // The database page size in bytes.
  "file format write version": number; // 1 for legacy; 2 for WAL.
  "file format read version": number; // 1 for legacy; 2 for WAL.
  "reserved space at end of each page": number; // Bytes of unused "reserved" space at the end of each page.
  "maximum embedded payload fraction": number; // Must be 64.
  "minimum embedded payload fraction": number; // Must be 32.
  "leaf payload fraction": number; // Must be 32.
  "file change counter": number; // File change counter.
  "number of pages": number; // Size of the database file in pages.
  "first freelist trunk page": number; // Page number of the first freelist trunk page.
  "total freelist pages": number; // Total number of freelist pages.
  "schema cookie": number; // The schema cookie.
  "schema format number": number; // Supported schema formats are 1, 2, 3, and 4.
  "default page cache size": number; // Default page cache size.
  "largest root b-tree page number": number; // Page number of the largest root b-tree page in vacuum modes.
  "database text encoding": number; // 1 for UTF-8, 2 for UTF-16le, 3 for UTF-16be.
  "user version": number; // The "user version" set by the user_version pragma.
  "incremental vacuum mode": number; // True (non-zero) for incremental-vacuum mode, false otherwise.
  "application ID": number; // The "Application ID" set by PRAGMA application_id.
  "reserved for expansion": Uint8Array; // Reserved for expansion. Must be zero.
  "version valid for number": number; // The version-valid-for number.
  "sqlite version number": number; // SQLITE_VERSION_NUMBER.
}

export interface BTreePageHeader {
  "b-tree page type": number; // One-byte flag at offset 0 indicating the b-tree page type.
  "start of first freeblock": number; // Two-byte integer at offset 1 indicating the start of the first freeblock on the page, or zero if none.
  "number of tables": number; // Two-byte integer at offset 3 representing the number of cells on the page.
  "start of cell content area": number; // Two-byte integer at offset 5 designating the start of the cell content area, with zero interpreted as 65536.
  "number of fragmented free bytes": number; // One-byte integer at offset 7 representing the number of fragmented free bytes within the cell content area.
  //"right-most pointer": number | null; // Four-byte page number at offset 8, applicable only to interior b-tree pages.
}

export interface SQLiteSchemaCell {
  sizeOfTheRecord: number; // Size of the entire record in bytes
  rowId: number; // Row ID of the record
  sizeOfTheRecordHeader: number; // Size of the record header
  sizeOfSqliteSchemaType: number; // Size of the 'type' field in bytes
  sizeOfSqliteSchemaName: number; // Size of the 'name' field in bytes
  sizeOfSqliteSchemaTableName: number; // Size of the 'tbl_name' field in bytes
  sqliteRootPage: number; // Root page number for the table
  sizeOfSqliteSchema: number; // Size of the 'sql' field in bytes
  valueOfSqlSchemaType: string; // Value of the 'type' field (e.g., "table")
  valueOfSqlSchemaName: string; // Value of the 'name' field (table name)
  valueOfSqlSchemaTableName: string; // Value of the 'tbl_name' field (table name)
}