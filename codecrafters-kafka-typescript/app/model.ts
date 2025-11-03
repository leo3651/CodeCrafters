export const REPLICAS_ARRAY_ITEM_BUFFER_SIZE: number = 4;
export const ISR_ARRAY_ITEM_BUFFER_SIZE: number = 4;
export const ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE: number = 4;
export const LAST_KNOWN_ELR_ARR_IT_BUF_SIZE: number = 4;
export const OFFLINE_REPLICAS_ARR_IT_BUF_SIZE: number = 4;

export interface IKafkaRequestHeader {
  messageSize: number;
  correlationID: number;
  reqApiKey: number;
  reqApiVersion: number;
  clientID: Buffer;
  clientIDLen: number;
}

export interface IApiVersion {
  apiKey: number;
  maxVersion: number;
  minVersion: number;
}

export const enum EMetadataRecordType {
  TOPIC = 2,
  PARTITION = 3,
  FEATURE_LEVEL = 12,
}

export const enum EErrorCode {
  UNKNOWN_TOPIC = 100,
  UNSUPPORTED_VERSION = 35,
  UNKNOWN_TOPIC_OR_PARTITION = 3,
  NO_ERROR = 0,
}

export enum EByteSize {
  writeUInt8,
  writeInt8,

  writeUInt16BE,
  writeInt16BE,

  writeUInt32BE,
  writeInt32BE,

  writeBigUInt64BE,
  writeBigInt64BE,
}

export interface Variant {
  value: number;
  length: number;
}

export interface RecordHeader {
  hKeyLen: number;
  hKey: Buffer<ArrayBufferLike> | null;
  hKeyValLen: number;
  hKeyVal: Buffer<ArrayBufferLike> | null;
}
