interface IKafkaHeader {
  messageSize: number;
  correlationID: number;
}

export interface IKafkaRequestHeader extends IKafkaHeader {
  reqApiKey: number;
  reqApiVersion: number;
  clientID: Buffer;
  clientIDLen: number;
}

export interface IKafkaRequestDescribePartitions extends IKafkaRequestHeader {
  topics: ITopic[];
  partitionLimit: number;
}

export interface IKafkaFetchRequest extends IKafkaRequestHeader {
  topics: ITopicFetchItem[];
}

export interface IKafkaResponseHeader extends IKafkaHeader {
  errorCode: number;
}

export interface IApiVersion {
  apiKey: number;
  maxVersion: number;
  minVersion: number;
}

export interface ITopic {
  topicName: Buffer;
  topicNameLen: number;
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
  writeInt8 = 1,
  writeInt16BE = 2,
  writeInt32BE = 4,
  writeBigUInt64BE = 8,
}

export interface ITopicFetchItem {
  partitions: number[];
  topicId: Buffer;
  bufferSize: number;
}
