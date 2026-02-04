import type { IDecodedValue } from "./model";

export const encodeString = (str: string): string => `${str.length}:${str}`;

export const encodeNumber = (number: number): string => `i${number}e`;

export const encodeList = (list: IDecodedValue[]): string => {
  let encodedList: string = "l";

  list.forEach((el) => {
    if (typeof el === "string") {
      encodedList += encodeString(el);
    }

    if (typeof el === "number") {
      encodedList += encodeNumber(el);
    }

    if (Array.isArray(el)) {
      encodeList(el);
    }

    if (typeof el === "object" && !Array.isArray(el)) {
      encodeDict(el);
    }
  });

  return encodedList + "e";
};

export const encodeDict = (el: IDecodedValue): string => {
  let encodedDict: string = "d";

  Object.entries(el)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, value]) => {
      encodedDict += encodeString(key);

      if (typeof value === "string") {
        encodedDict += encodeString(value);
      }

      if (typeof value === "number") {
        encodedDict += encodeNumber(value);
      }

      if (typeof value === "object" && !Array.isArray(value)) {
        encodedDict += encodeDict(value);
      }

      if (Array.isArray(value)) {
        encodedDict += encodeList(value);
      }
    });

  return encodedDict + "e";
};
