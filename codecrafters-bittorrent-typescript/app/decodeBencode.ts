import type { BencodedValue, DecodedDict } from "./model";

export function decodeBencode(bencodedValue: string): [BencodedValue, number] {
  /* This function is used to decode a bencoded string */

  // Decode string
  //console.log(bencodedValue);
  if (!isNaN(parseInt(bencodedValue[0]))) {
    const firstColonIndex = bencodedValue.indexOf(":");
    if (firstColonIndex === -1) {
      throw new Error("Invalid encoded value");
    }
    const stringLen = parseInt(bencodedValue.split(":")[0]);
    return [
      bencodedValue.slice(firstColonIndex + 1, firstColonIndex + 1 + stringLen),
      firstColonIndex + 1 + stringLen,
    ];
  }

  // Decode int
  else if (bencodedValue[0] === "i") {
    const firstEIndex = bencodedValue.indexOf("e");
    return [
      Number.parseFloat(bencodedValue.slice(1, firstEIndex)),
      firstEIndex + 1,
    ];
  }

  // Decode bencoded list
  else if (bencodedValue[0] === "l") {
    let offset = 1;
    let decodedArr: BencodedValue = [];

    while (offset < bencodedValue.length) {
      if (bencodedValue[offset] === "e") {
        break;
      }
      const [decodedVal, encodedLen] = decodeBencode(
        bencodedValue.slice(offset)
      );
      decodedArr.push(decodedVal);
      offset += encodedLen;
    }

    return [decodedArr, offset + 1];
  }

  // Decode bencoded dict
  else if (bencodedValue[0] === "d") {
    let offset = 1;
    let decodedDict: DecodedDict = {};

    while (offset < bencodedValue.length) {
      if (bencodedValue[offset] === "e") {
        break;
      }

      const [decodedKey, encodedKeyLen] = decodeBencode(
        bencodedValue.slice(offset)
      );
      offset += encodedKeyLen;
      const [decodedValue, encodedValueLen] = decodeBencode(
        bencodedValue.slice(offset)
      );
      offset += encodedValueLen;

      decodedDict[decodedKey as string] = decodedValue;
    }

    return [decodedDict, offset + 1];
  } else {
    throw new Error("Unsupported type");
  }
}
