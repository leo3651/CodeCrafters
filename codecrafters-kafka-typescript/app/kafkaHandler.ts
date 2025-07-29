import {
  EErrorCode,
  type IApiVersion,
  type IKafkaRequestHeader,
  type IKafkaRequestHeaderDescribePartitions,
  type ITopic,
} from "./model";
import { utils } from "./utils";
import {
  KafkaClusterMetadataLogFile,
  KafkaClusterMetadataPartitionRecord,
} from "./metaDataParser";

class KafkaHandler {
  clusterMetadataLogFile!: KafkaClusterMetadataLogFile;

  private SUPPORTED_API_VERSIONS: number[] = [0, 1, 2, 3, 4];

  // LENGTHS IN BYTES
  private readonly API_KEY_BUFFER_SIZE = 2;
  private readonly API_MIN_VERSION_BUFFER_SIZE = 2;
  private readonly API_MAX_VERSION_BUFFER_SIZE = 2;
  private readonly TAG_BUFFER_SIZE = 1;
  private readonly CORRELATION_ID_BUFFER_SIZE = 4;
  private readonly MESSAGE_LENGTH_BUFFER_SIZE = 4;
  private readonly ERROR_CODE_BUFFER_SIZE = 2;
  private readonly THROTTLE_TIME_BUFFER_SIZE = 4;

  private readonly PARTITION_INDEX_BUFFER_SIZE = 4;
  private readonly LEADER_ID_BUFFER_SIZE = 4;
  private readonly LEADER_EPOCH_BUFFER_SIZE = 4;
  private readonly REPLICAS_ARRAY_ITEM_BUFFER_SIZE = 4;
  private readonly ISR_ARRAY_ITEM_BUFFER_SIZE = 4;
  private readonly ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE = 4;
  private readonly LAST_KNOWN_ELR_ARR_IT_BUF_SIZE = 4;
  private readonly OFFLINE_REPLICAS_ARR_IT_BUF_SIZE = 4;

  constructor() {
    const fileLocation = process.argv[2];
    if (fileLocation) {
      try {
        this.clusterMetadataLogFile = KafkaClusterMetadataLogFile.fromFile(
          "/tmp/kraft-combined-logs/__cluster_metadata-0/00000000000000000000.log"
        );
        console.log(this.clusterMetadataLogFile);
      } catch (err) {
        console.log("Could not read cluster metadata file", err);
      }
    }
  }

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
    console.log("HEADER: ");
    console.log(header);

    // Describe partitions
    if (reqApiKey === 75) {
      const describePartitionsReqHeader = this.parseDescribePartitionsHeader(
        data,
        relevantDataOffset
      );

      responseBody = this.createV0DescribePartitionsResHeaderBody({
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

  private parseDescribePartitionsHeader(
    data: Buffer,
    offset: number
  ): { topics: ITopic[]; partitionLimit: number } {
    const topics = [];

    const { value, length } = utils.readVariant(data.subarray(offset), false);
    const numOfTopics = value - 1;
    offset += length;

    for (let i = 0; i < numOfTopics; i++) {
      let { value: topicNameLen, length } = utils.readVariant(
        data.subarray(offset),
        false
      );
      offset += length;

      topicNameLen--;
      const topicName = data.slice(offset, offset + topicNameLen);
      offset += topicNameLen;
      offset++;

      topics.push({ topicName, topicNameLen });
    }

    const partitionLimit = data.readInt32BE(offset);

    return { topics, partitionLimit };
  }

  private createV4ResponseHeaderBody(header: IKafkaRequestHeader): Buffer {
    let errorCode: EErrorCode = EErrorCode.NO_ERROR;

    if (!this.SUPPORTED_API_VERSIONS.includes(header.reqApiVersion)) {
      errorCode = EErrorCode.UNSUPPORTED_VERSION;
    }

    const correlationIDBuffer = this.buildCorrelationIDBuffer(
      header.correlationID
    );

    const errorCodeBuffer = this.buildErrorCodeBuffer(errorCode);

    const apiVersionBuffer = this.buildApiVersionsArrayBuffer([
      { apiKey: header.reqApiKey, maxVersion: 4, minVersion: 0 },
      { apiKey: 75, maxVersion: 0, minVersion: 0 },
      { apiKey: 1, maxVersion: 16, minVersion: 0 },
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

  private createV0DescribePartitionsResHeaderBody(
    header: IKafkaRequestHeaderDescribePartitions
  ): Buffer {
    const correlationIDBuf = this.buildCorrelationIDBuffer(
      header.correlationID
    );
    const tagBuffer = this.buildTagBuffer(0);

    const topicThrottleTimeMsBuf = this.buildThrottleTimeBuffer(0);
    const topicsArrLenBuf = utils.writeUnsignedVariant(
      header.topics.length + 1
    );
    const topicsBufArr = this.createTopics(header);

    const cursorBuf = Buffer.alloc(1);
    cursorBuf.writeUInt8(0xff, 0);

    return Buffer.concat([
      correlationIDBuf,
      tagBuffer,
      topicThrottleTimeMsBuf,
      topicsArrLenBuf,
      ...topicsBufArr,
      cursorBuf,
      tagBuffer,
    ]);
  }

  private createTopics(
    header: IKafkaRequestHeaderDescribePartitions
  ): Buffer[] {
    const metaFileTopicRecords = this.clusterMetadataLogFile.getTopicRecords();

    return header.topics.flatMap((topic) => {
      const matchingTopicRecord = metaFileTopicRecords.find(
        (metaFileTopic) => metaFileTopic.name === topic.topicName.toString()
      );

      const errorCode = matchingTopicRecord
        ? EErrorCode.NO_ERROR
        : EErrorCode.UNKNOWN_TOPIC_OR_PARTITION;

      const topicIdBuf = matchingTopicRecord?.uuid || Buffer.alloc(16);

      const metaFilePartitionRecords =
        this.clusterMetadataLogFile.getPartitionRecordsMatchTopicUuid(
          topicIdBuf
        );
      const partitionRecordsResponseBuffer = metaFilePartitionRecords.flatMap(
        (partitionRecord, index) =>
          this.createTopicPartitionItem(partitionRecord, index)
      );

      return this.createTopic(
        errorCode,
        topic.topicName.length,
        topic.topicName,
        topicIdBuf,
        metaFilePartitionRecords.length,
        partitionRecordsResponseBuffer
      );
    });
  }

  private createTopic(
    errorCode: EErrorCode,
    topicNameLen: number,
    topicNameBuf: Buffer,
    topicIdBuf: Buffer,
    topicPartitionsLenBuf: number,
    topicPartitionsBuf: Buffer[]
  ): Buffer {
    const topicErrorCodeBuf: Buffer = this.buildErrorCodeBuffer(errorCode);
    const topicNameLenBuf = utils.writeUnsignedVariant(topicNameLen + 1);
    const topicIsInternalBuf = Buffer.alloc(1);
    topicIsInternalBuf.writeUInt8(0, 0);

    const partitionsArrayLengthBuf = utils.writeUnsignedVariant(
      topicPartitionsLenBuf + 1
    );

    const topicAuthorizationOperations = Buffer.alloc(4);
    topicAuthorizationOperations.writeInt32BE(0x00000df8, 0);

    const topicTagBuffer = this.buildTagBuffer(0);

    return Buffer.concat([
      topicErrorCodeBuf,
      topicNameLenBuf,
      topicNameBuf,
      topicIdBuf,
      topicIsInternalBuf,
      partitionsArrayLengthBuf,
      ...topicPartitionsBuf,
      topicAuthorizationOperations,
      topicTagBuffer,
    ]);
  }

  private createTopicPartitionItem(
    partitionRecord: KafkaClusterMetadataPartitionRecord,
    index: number
  ): Buffer {
    const errorCodeBuffer = Buffer.alloc(this.ERROR_CODE_BUFFER_SIZE);
    errorCodeBuffer.writeUInt16BE(EErrorCode.NO_ERROR);

    const partitionIndexBuffer = Buffer.alloc(this.PARTITION_INDEX_BUFFER_SIZE);
    partitionIndexBuffer.writeUInt32BE(index);

    const leaderIdBuffer = Buffer.alloc(this.LEADER_ID_BUFFER_SIZE);
    leaderIdBuffer.writeUInt32BE(partitionRecord.leader);

    const leaderEpochBuffer = Buffer.alloc(this.LEADER_EPOCH_BUFFER_SIZE);
    leaderEpochBuffer.writeUInt32BE(partitionRecord.leaderEpoch);

    const replicaLength = partitionRecord.replicas.length;
    const replicaLengthBuffer = utils.writeUnsignedVariant(replicaLength + 1); // +1 for the length byte

    const replicasBuffer = Buffer.alloc(
      replicaLength * this.REPLICAS_ARRAY_ITEM_BUFFER_SIZE
    );

    partitionRecord.replicas.forEach((replica, index) => {
      replicasBuffer.writeUInt32BE(
        replica,
        index * this.REPLICAS_ARRAY_ITEM_BUFFER_SIZE
      );
    });

    const isr: number[] = [1];
    const isrLength = isr.length;
    const isrLengthBuffer = utils.writeUnsignedVariant(isrLength + 1); // +1 for the length byte
    const isrBuffer = Buffer.alloc(isrLength * this.ISR_ARRAY_ITEM_BUFFER_SIZE);
    isr.forEach((isr, index) => {
      isrBuffer.writeUInt32BE(isr, index * this.ISR_ARRAY_ITEM_BUFFER_SIZE);
    });

    const eligibleReplicas: number[] = [];
    const eligibleReplicasLength = eligibleReplicas.length;
    const eligibleReplicasLengthBuffer = utils.writeUnsignedVariant(
      eligibleReplicasLength + 1 // +1 for the length byte
    );
    const eligibleReplicasBuffer = Buffer.alloc(
      eligibleReplicasLength * this.ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE
    );
    eligibleReplicas.forEach((replica, index) => {
      eligibleReplicasBuffer.writeUInt32BE(
        replica,
        index * this.ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE
      );
    });

    const lastKnownELR: number[] = [];
    const lastKnownELRLength = lastKnownELR.length;
    const lastKnownELRLengthBuffer = utils.writeUnsignedVariant(
      lastKnownELRLength + 1 // +1 for the length byte
    );
    const lastKnownELRBuffer = Buffer.alloc(
      lastKnownELRLength * this.LAST_KNOWN_ELR_ARR_IT_BUF_SIZE
    );
    lastKnownELR.forEach((elr, index) => {
      lastKnownELRBuffer.writeUInt32BE(
        elr,
        index * this.LAST_KNOWN_ELR_ARR_IT_BUF_SIZE
      );
    });

    const offlineReplicas: number[] = [];
    const offlineReplicasLength = offlineReplicas.length;
    const offlineReplicasLengthBuffer = utils.writeUnsignedVariant(
      offlineReplicasLength + 1 // +1 for the length byte
    );
    const offlineReplicasBuffer = Buffer.alloc(
      offlineReplicasLength * this.OFFLINE_REPLICAS_ARR_IT_BUF_SIZE
    );
    offlineReplicas.forEach((replica, index) => {
      offlineReplicasBuffer.writeUInt32BE(
        replica,
        index * this.OFFLINE_REPLICAS_ARR_IT_BUF_SIZE
      );
    });

    const tagBufferValue = 0;
    const tagBuffer = Buffer.alloc(this.TAG_BUFFER_SIZE);
    tagBuffer.writeUInt8(tagBufferValue);

    return Buffer.concat([
      errorCodeBuffer,
      partitionIndexBuffer,
      leaderIdBuffer,
      leaderEpochBuffer,
      replicaLengthBuffer,
      replicasBuffer,
      isrLengthBuffer,
      isrBuffer,
      eligibleReplicasLengthBuffer,
      eligibleReplicasBuffer,
      lastKnownELRLengthBuffer,
      lastKnownELRBuffer,
      offlineReplicasLengthBuffer,
      offlineReplicasBuffer,
      tagBuffer,
    ]);
  }

  private buildErrorCodeBuffer(errorCode: EErrorCode): Buffer {
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

    const apiVersionsArrLenBuffer = utils.writeUnsignedVariant(
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
}

const kafkaHandler = new KafkaHandler();

export { kafkaHandler };
