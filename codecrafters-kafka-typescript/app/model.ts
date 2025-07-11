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

export interface IKafkaRequestHeaderDescribePartitions
  extends IKafkaRequestHeader {
  topics: ITopic[];
  partitionLimit: number;
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
