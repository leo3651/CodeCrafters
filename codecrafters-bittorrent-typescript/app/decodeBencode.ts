import type { IDecodedValue, DecodedDict } from "./model";

/**
 * @description used for decoding bencoded string
 */
export function decodeBencode(bencodedValue: string): [IDecodedValue, number] {
  // Decode string
  if (!isNaN(parseInt(bencodedValue[0]))) {
    const firstColonIndex: number = bencodedValue.indexOf(":");
    if (firstColonIndex === -1) {
      throw new Error("Invalid encoded value");
    }

    const stringLen: number = parseInt(bencodedValue.split(":")[0]);

    return [
      bencodedValue.slice(firstColonIndex + 1, firstColonIndex + 1 + stringLen),
      firstColonIndex + 1 + stringLen,
    ];
  }

  // Decode int
  else if (bencodedValue[0] === "i") {
    const firstEIndex: number = bencodedValue.indexOf("e");

    return [
      Number.parseFloat(bencodedValue.slice(1, firstEIndex)),
      firstEIndex + 1,
    ];
  }

  // Decode bencoded list
  else if (bencodedValue[0] === "l") {
    let offset: number = 1;
    let decodedArr: IDecodedValue[] = [];

    while (offset < bencodedValue.length) {
      if (bencodedValue[offset] === "e") {
        break;
      }

      const [decodedVal, encodedLen]: [IDecodedValue, number] = decodeBencode(
        bencodedValue.slice(offset),
      );

      decodedArr.push(decodedVal);
      offset += encodedLen;
    }

    return [decodedArr, offset + 1];
  }

  // Decode bencoded dict
  else if (bencodedValue[0] === "d") {
    let offset: number = 1;
    let decodedDict: DecodedDict = {};

    while (offset < bencodedValue.length) {
      if (bencodedValue[offset] === "e") {
        break;
      }

      const [decodedKey, encodedKeyLen]: [IDecodedValue, number] =
        decodeBencode(bencodedValue.slice(offset));
      offset += encodedKeyLen;

      const [decodedValue, encodedValueLen]: [IDecodedValue, number] =
        decodeBencode(bencodedValue.slice(offset));
      offset += encodedValueLen;

      decodedDict[decodedKey as string] = decodedValue;
    }

    return [decodedDict, offset + 1];
  }

  // Unsupported type
  else {
    throw new Error("Unsupported type");
  }
}
