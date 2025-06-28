import type { IApiVersion, IKafkaRequestHeader } from "./model";

class KafkaHandler {
  private SUPPORTED_API_VERSIONS: number[] = [0, 1, 2, 3, 4];

  private readonly API_VERSION_ITEM_BUFFER_SIZE = 7;
  private readonly API_KEY_BUFFER_SIZE = 2;
  private readonly API_MIN_VERSION_BUFFER_SIZE = 2;
  private readonly API_MAX_VERSION_BUFFER_SIZE = 2;
  private readonly TAG_BUFFER_SIZE = 1;
  private readonly CORRELATION_ID_BUFFER_SIZE = 4;
  private readonly MESSAGE_LENGTH_BUFFER_SIZE = 4;
  private readonly ERROR_CODE_BUFFER_SIZE = 2;
  private readonly THROTTLE_TIME_BUFFER_SIZE = 4;

  constructor() {}

  public parseKafkaHeader(data: Buffer): IKafkaRequestHeader {
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

  public createResponseHeader(reqHeader: IKafkaRequestHeader): Buffer {
    let errorCode = 0;

    if (!this.SUPPORTED_API_VERSIONS.includes(reqHeader.reqApiVersion)) {
      errorCode = 35;
    }

    const correlationIDBuffer = this.buildCorrelationIDBuffer(
      reqHeader.correlationID
    );
    const errorCodeBuffer = this.buildErrorCodeBuffer(errorCode);
    const apiVersionBuffer = this.buildApiVersionsArrayBuffer([
      { apiKey: reqHeader.reqApiKey, maxVersion: 4, minVersion: 0 },
    ]);
    const throttleTimeBuffer = this.buildThrottleTimeBuffer(0);
    const tagBuffer = this.buildTagBuffer();

    const bodyBuffer = Buffer.concat([
      correlationIDBuffer,
      errorCodeBuffer,
      apiVersionBuffer,
      throttleTimeBuffer,
      tagBuffer,
    ]);
    const messLengthBuffer = this.buildMessageSizeBuffer(bodyBuffer.length);

    return Buffer.concat([messLengthBuffer, bodyBuffer]);
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
    const apiVersionsBufferLen =
      apiVersionsList.length * this.API_VERSION_ITEM_BUFFER_SIZE + 1;

    const apiVersionsArrOfBuffers = apiVersionsList.map((apiVersion) =>
      this.buildApiVersionBuffer(apiVersion)
    );

    const apiVersionsBuffer = Buffer.alloc(apiVersionsBufferLen);

    apiVersionsBuffer.writeUInt8(apiVersionsList.length + 1, 0);

    let offset = 1;
    for (const buffer of apiVersionsArrOfBuffers) {
      buffer.copy(apiVersionsBuffer, offset);
      offset += buffer.length;
    }

    return apiVersionsBuffer;
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

  private buildThrottleTimeBuffer(throttleTime: number): Buffer {
    const throttleTimeBuffer = Buffer.alloc(this.THROTTLE_TIME_BUFFER_SIZE);
    throttleTimeBuffer.writeInt32BE(throttleTime);

    return throttleTimeBuffer;
  }

  private buildTagBuffer(): Buffer {
    const tagBuffer = Buffer.alloc(this.TAG_BUFFER_SIZE);
    tagBuffer.writeInt8(0);

    return tagBuffer;
  }
}

const kafkaHandler = new KafkaHandler();

export { kafkaHandler };
