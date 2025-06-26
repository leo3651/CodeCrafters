import type { IKafkaRequestHeader } from "./model";

class KafkaHandler {
  private SUPPORTED_API_VERSIONS: number[] = [];

  constructor() {}

  parseKafkaHeader(data: Buffer): IKafkaRequestHeader {
    const messageSize = data.readInt32BE();
    const reqApiKey = data.readInt16BE(4);
    const reqApiVersion = data.readInt16BE(6);
    const correlationID = data.readInt32BE(8);

    const kafkaHeader: IKafkaRequestHeader = {
      reqApiKey,
      reqApiVersion,
      correlationID,
      messageSize,
    };

    return kafkaHeader;
  }

  createResponseHeader(reqHeader: IKafkaRequestHeader): Buffer {
    const responseBuffer = Buffer.alloc(10);

    let errorCode = 0;

    if (!this.SUPPORTED_API_VERSIONS.includes(reqHeader.reqApiVersion)) {
      errorCode = 35;
    }

    responseBuffer.writeInt32BE(0, 0);
    responseBuffer.writeInt32BE(reqHeader.correlationID, 4);
    responseBuffer.writeInt16BE(errorCode, 8);

    return responseBuffer;
  }
}

const kafkaHandler = new KafkaHandler();
export { kafkaHandler };
