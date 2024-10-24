import { decodeBencode } from "./decodeBencode";
import { encodeDict } from "./encodeToBencode";
import type { MagnetLink } from "./model";

export function parseMagnetLink(magnetLink: string) {
  if (!magnetLink.startsWith("magnet:?")) {
    throw new Error("Invalid magnet link");
  }

  const magnetLinkParamsObject = magnetLink
    .slice(magnetLink.indexOf("?") + 1)
    .split("&")
    .reduce((acc, query) => {
      let [key, value] = query.split("=");
      if (key === "xt") {
        value = value.slice(9);
      }
      if (key === "tr") {
        value = decodeURIComponent(value);
      }
      acc[key] = value;
      return acc;
    }, {} as MagnetLink);

  console.log(
    `Tracker URL: ${magnetLinkParamsObject.tr}
Info Hash: ${magnetLinkParamsObject.xt}`
  );

  return magnetLinkParamsObject;
}

export function createExtensionHandshake() {
  const messageLen = Buffer.alloc(4);
  const messageId = Buffer.from([20]);
  const extensionMessageId = Buffer.alloc(1);
  extensionMessageId.writeUInt8(0, 0);
  const dictionary = {
    m: {
      ut_metadata: 16,
      ut_pex: 2,
    },
  };
  const bencodedDict = encodeDict(dictionary);
  console.log(bencodedDict);
  console.log(decodeBencode(bencodedDict)[0]);

  const payload = Buffer.concat([
    new Uint8Array(extensionMessageId),
    new Uint8Array(Buffer.from(bencodedDict)),
  ]);

  messageLen.writeUInt32BE(payload.length + 1, 0);

  return new Uint8Array(
    Buffer.concat([
      new Uint8Array(messageLen),
      new Uint8Array(messageId),
      new Uint8Array(payload),
    ])
  );
}
