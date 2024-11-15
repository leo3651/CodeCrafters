export function readVariant(buffer: Buffer) {
  const bytes = Buffer.from(buffer);
  let result = 0;
  let i = 0;

  while (i < 8) {
    result <<= 7;
    result |= bytes[i] & 0x7f;

    if (bytes[i] < 0x80) {
      break;
    }
    i++;
  }

  return { result, bytesRead: i + 1 };
}

/**
 * Parses the value of the buffer.
 */
export function parseSerialTypeValue(
  buffer: Buffer,
  targetSerialType: number,
  id: number
): string {
  // Parse value based on serial type
  if (targetSerialType >= 13 && targetSerialType % 2 === 1) {
    // Text
    return buffer.toString("utf-8");
  } else if (targetSerialType >= 12 && targetSerialType % 2 === 0) {
    // BLOB
    return buffer.toString("hex");
  } else if (targetSerialType === 1) {
    return buffer.readInt8(0).toString();
  } else if (targetSerialType === 2) {
    return buffer.readInt16BE(0).toString();
  } else if (targetSerialType === 3) {
    return buffer.readIntBE(0, 3).toString();
  } else if (targetSerialType === 4) {
    return buffer.readInt32BE(0).toString();
  } else if (targetSerialType === 5) {
    return buffer.readIntBE(0, 6).toString();
  } else if (targetSerialType === 6) {
    return buffer.readBigInt64BE(0).toString();
  } else if (targetSerialType === 7) {
    return buffer.readDoubleBE(0).toString();
  } else if (targetSerialType === 8 || targetSerialType === 9) {
    return "0";
  } else {
    return `${id}`;
  }
}

/**
 * Determines the byte size of a column based on its serial type.
 */
export function getSerialTypeSize(serialType: number): number {
  if (serialType === 0) return 0; // NULL
  if (serialType === 1) return 1; // 8-bit integer
  if (serialType === 2) return 2; // 16-bit integer
  if (serialType === 3) return 3; // 24-bit integer
  if (serialType === 4) return 4; // 32-bit integer
  if (serialType === 5) return 6; // 48-bit integer
  if (serialType === 6) return 8; // 64-bit integer
  if (serialType === 7) return 8; // 64-bit float
  if (serialType === 8 || serialType === 9) return 0; // Reserved integers 0 or 1
  if (serialType >= 12 && serialType % 2 === 0) return (serialType - 12) / 2; // BLOB
  if (serialType >= 13 && serialType % 2 === 1) return (serialType - 13) / 2; // Text
  return 0;
}

function binarySearchFirst(
  cellPointerArr: number[],
  buffer: Buffer,
  target: string,
  parseCellMethod: (buffer: Buffer) => { indexedValue: string; id: string }
): number {
  let left = 0;
  let right = cellPointerArr.length - 1;
  let firstIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (
      parseCellMethod(buffer.slice(cellPointerArr[mid])).indexedValue === target
    ) {
      firstIndex = mid;
      right = mid - 1; // Continue to search in the left half
    } else if (
      parseCellMethod(buffer.slice(cellPointerArr[mid])).indexedValue < target
    ) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return firstIndex;
}

function binarySearchLast(
  cellPointerArr: number[],
  buffer: Buffer,
  target: string,
  parseCellMethod: (buffer: Buffer) => { indexedValue: string; id: string }
): number {
  let left = 0;
  let right = cellPointerArr.length - 1;
  let lastIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (
      parseCellMethod(buffer.slice(cellPointerArr[mid])).indexedValue === target
    ) {
      lastIndex = mid;
      left = mid + 1; // Continue to search in the right half
    } else if (
      parseCellMethod(buffer.slice(cellPointerArr[mid])).indexedValue < target
    ) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return lastIndex;
}

export function findAllOccurrencesWithBinarySearch(
  arr: number[],
  buffer: Buffer,
  target: string,
  parseCellMethod: (buffer: Buffer) => { indexedValue: string; id: string }
): number[] {
  const firstIndex = binarySearchFirst(arr, buffer, target, parseCellMethod);

  if (firstIndex === -1) {
    return []; // Target not found
  }

  const lastIndex = binarySearchLast(arr, buffer, target, parseCellMethod);
  return arr.slice(firstIndex, lastIndex + 1);
}
