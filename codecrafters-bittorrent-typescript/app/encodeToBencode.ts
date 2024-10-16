import type { BencodedValue, DecodedDict, Torrent, TorrentInfo } from "./model";

export const encodeString = (str: string) => {
  return `${str.length}:${str}`;
};

export const encodeNumber = (number: number) => {
  return `i${number}e`;
};

export const encodeList = (list: BencodedValue[]) => {
  let encodedList = "l";
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

export const encodeDict = (el: DecodedDict | TorrentInfo | Torrent) => {
  let encodedDict = "d";
  Object.entries(el)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .forEach(([key, value]) => {
      if (typeof key === "string") {
        encodedDict += encodeString(key);
      } else {
        throw new Error("Invalid key");
      }

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
