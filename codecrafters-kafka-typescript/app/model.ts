export interface IKafkaHeader {
  messageSize: number;
  reqApiKey: number;
  reqApiVersion: number;
  correlationID: number;
}
