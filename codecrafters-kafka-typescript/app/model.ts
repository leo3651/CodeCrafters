interface IKafkaHeader {
  messageSize: number;
  correlationID: number;
}

export interface IKafkaRequestHeader extends IKafkaHeader {
  reqApiKey: number;
  reqApiVersion: number;
}

export interface IKafkaResponseHeader extends IKafkaHeader {
  errorCode: number;
}
