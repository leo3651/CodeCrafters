import type {
  IApiVersion,
  IKafkaRequestHeader,
  IKafkaRequestHeaderDescribePartitions,
  ITopic,
} from "./model";

class KafkaHandler {
  private SUPPORTED_API_VERSIONS: number[] = [0, 1, 2, 3, 4];

  private readonly API_KEY_BUFFER_SIZE = 2;
  private readonly API_MIN_VERSION_BUFFER_SIZE = 2;
  private readonly API_MAX_VERSION_BUFFER_SIZE = 2;
  private readonly TAG_BUFFER_SIZE = 1;
  private readonly CORRELATION_ID_BUFFER_SIZE = 4;
  private readonly MESSAGE_LENGTH_BUFFER_SIZE = 4;
  private readonly ERROR_CODE_BUFFER_SIZE = 2;
  private readonly THROTTLE_TIME_BUFFER_SIZE = 4;

  constructor() {}

  public createResponse(data: Buffer): Buffer {
    let responseBody: Buffer = Buffer.alloc(0);

    const messageSize = data.readInt32BE();
    const reqApiKey = data.readInt16BE(4);
    const reqApiVersion = data.readInt16BE(6);
    const correlationID = data.readInt32BE(8);
    const clientIDLen = data.readInt16BE(12);
    const clientID = data.slice(14, 14 + clientIDLen);

    // 14 - start of clientID + clientIDLength + tagBuffer
    const relevantDataOffset = 14 + clientIDLen + 1;
    const header: IKafkaRequestHeader = {
      messageSize,
      reqApiKey,
      reqApiVersion,
      correlationID,
      clientIDLen,
      clientID,
    };

    // Describe partitions
    if (reqApiKey === 75) {
      const describePartitionsReqHeader = this.parseDescribePartitionsHeader(
        data,
        relevantDataOffset
      );

      responseBody = this.createDescribePartitionsResHeaderBody({
        ...header,
        ...describePartitionsReqHeader,
      });
    }

    // Request api versions
    else if (reqApiKey === 18) {
      responseBody = this.createV4ResponseHeaderBody(header);
    }

    const mesLenBuffer = this.buildMessageSizeBuffer(responseBody.length);

    return Buffer.concat([mesLenBuffer, responseBody]);
  }

  public createV4ResponseHeaderBody(header: IKafkaRequestHeader): Buffer {
    let errorCode = 0;

    if (!this.SUPPORTED_API_VERSIONS.includes(header.reqApiVersion)) {
      errorCode = 35;
    }

    const correlationIDBuffer = this.buildCorrelationIDBuffer(
      header.correlationID
    );

    const errorCodeBuffer = this.buildErrorCodeBuffer(errorCode);
    const apiVersionBuffer = this.buildApiVersionsArrayBuffer([
      { apiKey: header.reqApiKey, maxVersion: 4, minVersion: 0 },
      { apiKey: 75, maxVersion: 0, minVersion: 0 },
    ]);
    const throttleTimeBuffer = this.buildThrottleTimeBuffer(0);
    const tagBuffer = this.buildTagBuffer(0);

    return Buffer.concat([
      correlationIDBuffer,
      errorCodeBuffer,
      apiVersionBuffer,
      throttleTimeBuffer,
      tagBuffer,
    ]);
  }

  private createDescribePartitionsResHeaderBody(
    header: IKafkaRequestHeaderDescribePartitions
  ): Buffer {
    const correlationID = this.buildCorrelationIDBuffer(header.correlationID);
    const topicTagBuffer = this.buildTagBuffer(0);
    const topicThrottleTimeMs = this.buildThrottleTimeBuffer(0);
    const topicsArrLen = this.writeUnsignedVariant(header.topics.length + 1);
    const topicErrorCode: Buffer = this.buildErrorCodeBuffer(3);

    const topics = header.topics.map((topic) => {
      const topicNameLen = this.writeUnsignedVariant(topic.topicNameLen + 1);
      const topicId = Buffer.alloc(16).fill(0);

      return Buffer.concat([topicNameLen, topic.topicName, topicId]);
    });

    const topicIsInternal = Buffer.alloc(1);
    topicIsInternal.writeUInt8(0, 0);
    const topicPartition = this.writeUnsignedVariant(0 + 1);
    const topicAuthorizationOperations = Buffer.alloc(4);
    topicAuthorizationOperations.writeInt32BE(0x00000df8, 0);
    const topicCursor = Buffer.alloc(1);
    topicCursor.writeUInt8(0xff, 0);

    return Buffer.concat([
      correlationID,
      topicTagBuffer,
      topicThrottleTimeMs,
      topicsArrLen,
      topicErrorCode,
      ...topics,
      topicIsInternal,
      topicPartition,
      topicAuthorizationOperations,
      topicTagBuffer,
      topicCursor,
      topicTagBuffer,
    ]);
  }

  private parseDescribePartitionsHeader(
    data: Buffer,
    startingPoint: number
  ): { topics: ITopic[]; partitionLimit: number } {
    const topics = [];
    let { value, offset } = this.readVariant(data, startingPoint);
    const numOfTopics = value - 1;

    for (let i = 0; i < numOfTopics; i++) {
      let { value: topicNameLen, offset: newOffset } = this.readVariant(
        data,
        offset
      );
      offset = newOffset;

      topicNameLen--;
      const topicName = data.slice(offset, offset + topicNameLen);
      offset += topicNameLen;
      offset++; // Topic tag buffer

      topics.push({ topicName, topicNameLen });
    }

    const partitionLimit = data.readInt32BE(offset);

    return { topics, partitionLimit };
  }

  private buildErrorCodeBuffer(errorCode: number): Buffer {
    const errorCodeBuffer = Buffer.alloc(this.ERROR_CODE_BUFFER_SIZE);
    errorCodeBuffer.writeInt16BE(errorCode);

    return errorCodeBuffer;
  }

  private buildMessageSizeBuffer(messLen: number): Buffer {
    const mesSizeBuffer = Buffer.alloc(this.MESSAGE_LENGTH_BUFFER_SIZE);
    mesSizeBuffer.writeInt32BE(messLen);

    return mesSizeBuffer;
  }

  private buildCorrelationIDBuffer(correlationID: number): Buffer {
    const corrIDBuf = Buffer.alloc(this.CORRELATION_ID_BUFFER_SIZE);
    corrIDBuf.writeInt32BE(correlationID);

    return corrIDBuf;
  }

  private buildApiVersionsArrayBuffer(apiVersionsList: IApiVersion[]): Buffer {
    const apiVersionsArrOfBuffers = apiVersionsList.map((apiVersion) =>
      this.buildApiVersionBuffer(apiVersion)
    );

    const apiVersionsArrLenBuffer = this.writeUnsignedVariant(
      apiVersionsList.length + 1
    );

    return Buffer.concat([apiVersionsArrLenBuffer, ...apiVersionsArrOfBuffers]);
  }

  private buildApiVersionBuffer(apiVersion: IApiVersion): Buffer {
    // API key (int16, 2 bytes)
    const apiKeyBuffer = Buffer.alloc(this.API_KEY_BUFFER_SIZE);
    apiKeyBuffer.writeInt16BE(apiVersion.apiKey);

    // Min version (int16, 2 bytes)
    const apiMinVersionBuffer = Buffer.alloc(this.API_MIN_VERSION_BUFFER_SIZE);
    apiMinVersionBuffer.writeInt16BE(apiVersion.minVersion);

    // Max version (int16, 2 bytes)
    const apiMaxVersionBuffer = Buffer.alloc(this.API_MAX_VERSION_BUFFER_SIZE);
    apiMaxVersionBuffer.writeInt16BE(apiVersion.maxVersion);

    // Tag buffer (optional, 1 bytes, set to 0)
    const tagBuffer = Buffer.alloc(this.TAG_BUFFER_SIZE);
    tagBuffer.writeInt8(0);

    return Buffer.concat([
      apiKeyBuffer,
      apiMinVersionBuffer,
      apiMaxVersionBuffer,
      tagBuffer,
    ]);
  }

  private buildThrottleTimeBuffer(throttleTimeMs: number): Buffer {
    const throttleTimeBuffer = Buffer.alloc(this.THROTTLE_TIME_BUFFER_SIZE);
    throttleTimeBuffer.writeInt32BE(throttleTimeMs);

    return throttleTimeBuffer;
  }

  private buildTagBuffer(value: number): Buffer {
    const tagBuffer = Buffer.alloc(this.TAG_BUFFER_SIZE);
    tagBuffer.writeInt8(value);

    return tagBuffer;
  }

  public readVariant(
    data: Buffer,
    offset: number
  ): { value: number; offset: number } {
    let value: number = 0;
    let shift: number = 0;

    while (true) {
      value |= (0b01111111 & data[offset]) << shift;

      if ((data[offset] & 0b10000000) === 0) {
        break;
      }

      shift += 7;
      offset++;
    }

    offset++;

    return { value, offset };
  }

  public writeUnsignedVariant(value: number): Buffer {
    const chunks: number[] = [];

    while (true) {
      const byte = value & 0b01111111;
      value >>>= 7;

      if (value === 0) {
        chunks.push(byte);
        break;
      }

      chunks.push(byte | 0b10000000);
    }

    return Buffer.from(chunks);
  }
}

const kafkaHandler = new KafkaHandler();

export { kafkaHandler };
