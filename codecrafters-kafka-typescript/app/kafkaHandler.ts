import type { IKafkaHeader } from "./model";

class KafkaHandler {
  constructor() {}

  parseKafkaHeader(data: Buffer): IKafkaHeader {
    const messageSize = data.readInt32BE();
    const reqApiKey = data.readInt16BE(4);
    const reqApiVersion = data.readInt16BE(6);
    const correlationID = data.readInt32BE(8);

    const kafkaHeader: IKafkaHeader = {
      reqApiKey,
      reqApiVersion,
      correlationID,
      messageSize,
    };

    return kafkaHeader;
  }
}

const kafkaHandler = new KafkaHandler();
export { kafkaHandler };
