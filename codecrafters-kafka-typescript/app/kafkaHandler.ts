import {
  EByteSize,
  EErrorCode,
  type IApiVersion,
  type IKafkaRequestHeader,
  type IKafkaRequestDescribePartitions,
  type ITopic,
  type ITopicFetchItem,
  type IKafkaFetchRequest,
} from "./model";
import {
  KafkaClusterMetadataLogFile,
  KafkaClusterMetadataPartitionRecord,
  KafkaClusterMetadataRecordBatch,
  KafkaClusterMetadataRecordBatchItem,
  KafkaClusterMetadataTopicRecord,
} from "./metaDataParser";
import { crc32c, readVariant, writeUnsignedVariant } from "./utils";
import { KafkaPartitionLogFile } from "./kafkaPartitionsLogFile";

class KafkaHandler {
  private clusterMetadataLogFile!: KafkaClusterMetadataLogFile;

  private SUPPORTED_API_VERSIONS: number[] = [0, 1, 2, 3, 4];

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

    const commonHeader: IKafkaRequestHeader = {
      messageSize,
      reqApiKey,
      reqApiVersion,
      correlationID,
      clientIDLen,
      clientID,
    };
    console.log("HEADER: ");
    console.log(commonHeader);

    // 14 - start of clientID + clientIDLength + tagBuffer
    const relevantDataOffset = 14 + clientIDLen + 1;

    // Describe partitions
    if (reqApiKey === 75) {
      const describePartitionsReqHeader = this.parseDescribePartitionsRequest(
        data,
        relevantDataOffset
      );

      responseBody = this.createV0DescribePartitionsResBody({
        ...commonHeader,
        ...describePartitionsReqHeader,
      });
    }

    // Request api versions
    else if (reqApiKey === 18) {
      responseBody = this.createV4ResponseBody(commonHeader);
    }

    // Fetch
    else if (reqApiKey === 1) {
      const reqTopics = this.parseFetchRequest(data, relevantDataOffset);

      responseBody = this.createFetchResponseBody(
        { ...commonHeader, topics: reqTopics },
        0,
        EErrorCode.NO_ERROR,
        0
      );
    }

    const mesLenBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      responseBody.length
    );

    return Buffer.concat([mesLenBuffer, responseBody]);
  }

  private parseDescribePartitionsRequest(
    data: Buffer,
    offset: number
  ): { topics: ITopic[]; partitionLimit: number } {
    const topics = [];

    const { value, length } = readVariant(data.subarray(offset), false);

    const numOfTopics = value - 1;
    offset += length;

    for (let i = 0; i < numOfTopics; i++) {
      let { value: topicNameLen, length } = readVariant(
        data.subarray(offset),
        false
      );
      offset += length;

      topicNameLen--;
      const topicName = data.subarray(offset, offset + topicNameLen);

      offset += topicNameLen;
      offset++;

      topics.push({ topicName, topicNameLen });
    }

    const partitionLimit = data.readInt32BE(offset);

    return { topics, partitionLimit };
  }

  private parseFetchRequest(data: Buffer, offset: number): ITopicFetchItem[] {
    const maxWaitTime = data.readUInt32BE(offset);
    offset += 4;
    const minBytes = data.readUInt32BE(offset);
    offset += 4;
    const maxBytes = data.readUInt32BE(offset);
    offset += 4;
    const isolationLevel = data.readUInt8(offset);
    offset += 1;
    const sessionId = data.readUInt32BE(offset);
    offset += 4;
    const sessionEpoch = data.readUInt32BE(offset);
    offset += 4;

    const { value: numOfTopicsPlusOne, length: numOfTopicsBufferLength } =
      readVariant(data.subarray(offset), false);
    offset += numOfTopicsBufferLength;

    const numOfTopics = numOfTopicsPlusOne - 1;

    let topics: ITopicFetchItem[] = [];
    for (let i = 0; i < numOfTopics; i++) {
      const topicItem = this.parseFetchTopicRecord(data.subarray(offset));
      offset += topicItem.bufferSize;
      topics.push(topicItem);
    }

    return topics;
  }

  private parseFetchTopicRecord(data: Buffer): ITopicFetchItem {
    let offset = 0;

    const topicId = data.subarray(offset, offset + 16);
    offset += 16;

    const {
      value: numOfPartitionsPlusOne,
      length: numOfPartitionsBufferLength,
    } = readVariant(data.subarray(offset), false);

    offset += numOfPartitionsBufferLength;
    const numOfPartitions = numOfPartitionsPlusOne - 1;

    let partitions = [];
    for (let i = 0; i < numOfPartitions; i++) {
      const partitionId = data.readUInt32BE(offset);
      offset += 4;

      partitions.push(partitionId);
    }
    const bufferSize = 16 + numOfPartitionsBufferLength + numOfPartitions * 4;

    const topicItem: ITopicFetchItem = {
      partitions,
      topicId,
      bufferSize,
    };

    return topicItem;
  }

  private createV4ResponseBody(header: IKafkaRequestHeader): Buffer {
    let errorCode: EErrorCode = EErrorCode.NO_ERROR;

    if (!this.SUPPORTED_API_VERSIONS.includes(header.reqApiVersion)) {
      errorCode = EErrorCode.UNSUPPORTED_VERSION;
    }

    const correlationIDBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );

    const errorCodeBuffer = this.buildBuffer(EByteSize.writeInt16BE, errorCode);

    const apiVersionBuffer = this.buildApiVersionsBuffer([
      { apiKey: header.reqApiKey, maxVersion: 4, minVersion: 0 },
      { apiKey: 75, maxVersion: 0, minVersion: 0 },
      { apiKey: 1, maxVersion: 16, minVersion: 0 },
    ]);

    const throttleTimeBuffer = this.buildBuffer(EByteSize.writeInt32BE, 0);

    const tagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      correlationIDBuffer,
      errorCodeBuffer,
      apiVersionBuffer,
      throttleTimeBuffer,
      tagBuffer,
    ]);
  }

  private createV0DescribePartitionsResBody(
    header: IKafkaRequestDescribePartitions
  ): Buffer {
    const correlationIDBuf = this.buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );

    const tagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);

    const topicThrottleTimeMsBuf = this.buildBuffer(EByteSize.writeInt32BE, 0);

    const topicsArrLenBuf = writeUnsignedVariant(
      header.topics.length + 1,
      false
    );
    const topicsArrOfBuf = this.buildTopicsArrOfBuffers(header);

    const cursorBuf = Buffer.alloc(1);
    cursorBuf.writeUInt8(0xff, 0);

    return Buffer.concat([
      correlationIDBuf,
      tagBuffer,
      topicThrottleTimeMsBuf,
      topicsArrLenBuf,
      ...topicsArrOfBuf,
      cursorBuf,
      tagBuffer,
    ]);
  }

  private createFetchResponseBody(
    header: IKafkaFetchRequest,
    throttleTime: number,
    errorCode: EErrorCode,
    sessionId: number
  ): Buffer {
    const topicsInResponse = header.topics.map((topicReq) => {
      const partitionRecordsResponse = topicReq.partitions.map(
        (partitionId) => {
          const matchedTopicRecord =
            this.clusterMetadataLogFile.getMatchTopicRecord(topicReq.topicId);
          console.log(
            `matchedTopicRecord: ${matchedTopicRecord?.name} - partitionIndex: ${partitionId}`
          );
          return this.buildFetchTopicPartitionBuffer(
            partitionId,
            matchedTopicRecord
          );
        }
      );

      const topic = this.buildFetchTopicBuffer(
        topicReq.topicId, // topicId
        partitionRecordsResponse
      );

      return topic;
    });

    const correlationIDBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );
    const throttleTimeBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      throttleTime
    );
    const errorCodeBuffer = this.buildBuffer(EByteSize.writeInt16BE, errorCode);
    const sessionIdBuffer = this.buildBuffer(EByteSize.writeInt32BE, sessionId);
    const tagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);
    const numResponsesBuffer = writeUnsignedVariant(
      topicsInResponse.length + 1,
      false
    );

    return Buffer.concat([
      correlationIDBuffer,
      tagBuffer,
      throttleTimeBuffer,
      errorCodeBuffer,
      sessionIdBuffer,
      numResponsesBuffer,
      ...topicsInResponse,
      tagBuffer,
    ]);
  }

  private buildFetchTopicPartitionBuffer(
    partitionId: number,
    topic: KafkaClusterMetadataTopicRecord | undefined
  ): Buffer {
    let records: KafkaClusterMetadataRecordBatch[] = [];

    const errorCode = topic ? EErrorCode.NO_ERROR : EErrorCode.UNKNOWN_TOPIC;

    if (errorCode === EErrorCode.NO_ERROR) {
      const recordLogFile = KafkaPartitionLogFile.fromFile(
        `/tmp/kraft-combined-logs/${
          topic!.name
        }-${partitionId}/00000000000000000000.log`
      );
      records = recordLogFile.getRecords();

      records.forEach((record) => {
        console.log("RECORD", record);
        console.log("ITEM", record.recordBatchItems);
      });
    }

    const totalRecordsSize = records.reduce(
      (total, record) => total + record.bufferSize(),
      0
    );

    const compactRecordsLengthBuffer = writeUnsignedVariant(
      totalRecordsSize,
      false
    );
    const partitionIndexBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      partitionId
    );
    const errorCodeBuffer = this.buildBuffer(EByteSize.writeInt16BE, errorCode);
    const highWaterMarkBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      0n
    );
    const lastStableOffsetBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      0n
    );
    const logStartOffsetBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      0n
    );
    const abortedTransactionsBuffer = writeUnsignedVariant(0, false);
    const preferredReadReplicasBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      0
    );
    const tagFieldsArrayLengthBuffer = writeUnsignedVariant(0, false);
    const recordsBuffer = records.map((record) =>
      this.buildRecordBatchBuffer(record)
    );

    return Buffer.concat([
      partitionIndexBuffer,
      errorCodeBuffer,
      highWaterMarkBuffer,
      lastStableOffsetBuffer,
      logStartOffsetBuffer,
      abortedTransactionsBuffer,
      preferredReadReplicasBuffer,
      compactRecordsLengthBuffer,
      ...recordsBuffer,
      tagFieldsArrayLengthBuffer,
    ]);
  }

  private buildFetchTopicBuffer(topicId: Buffer, partitions: Buffer[]): Buffer {
    const numOfPartitionsBuffer = writeUnsignedVariant(
      partitions.length + 1,
      false
    );
    const tagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      topicId,
      numOfPartitionsBuffer,
      ...partitions,
      tagBuffer,
    ]);
  }

  private buildRecordBatchBuffer(
    recordBatch: KafkaClusterMetadataRecordBatch
  ): Buffer {
    const baseOffsetBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.baseOffset
    );
    const batchLengthBuffer = this.buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.batchLength
    );
    const partitionLeaderEpochBuffer = this.buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.partitionLeaderEpoch
    );
    const magicByteBuffer = this.buildBuffer(
      EByteSize.writeUInt8,
      recordBatch.magicByte
    );
    const crcBuffer = this.buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.crc
    );
    const attributesBuffer = this.buildBuffer(
      EByteSize.writeUInt16BE,
      recordBatch.attributes
    );
    const lastOffsetDeltaBuffer = this.buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.lastOffsetDelta
    );
    const baseTimestampBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.baseTimestamp
    );
    const maxTimestampBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.maxTimestamp
    );
    const producerIdBuffer = this.buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.producerId
    );
    const producerEpochBuffer = this.buildBuffer(
      EByteSize.writeUInt16BE,
      recordBatch.producerEpoch
    );
    const baseSequenceBuffer = this.buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.baseSequence
    );
    const recordCountBuffer = this.buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.recordCount
    );
    const arrOfRecordBatchItemsBuffer = recordBatch.recordBatchItems.map(
      (recordBatchItem) => this.buildRecordBatchItemBuffer(recordBatchItem)
    );

    const buffer = Buffer.concat([
      baseOffsetBuffer,
      batchLengthBuffer,
      partitionLeaderEpochBuffer,
      magicByteBuffer,
      crcBuffer,
      attributesBuffer,
      lastOffsetDeltaBuffer,
      baseTimestampBuffer,
      maxTimestampBuffer,
      producerIdBuffer,
      producerEpochBuffer,
      baseSequenceBuffer,
      recordCountBuffer,
      ...arrOfRecordBatchItemsBuffer,
    ]);

    // Update batch length
    baseOffsetBuffer.writeUInt32BE(buffer.length - 12);

    // Update crc
    const crcEndOffset = 17 + 4; // crc start offset + size
    const correctCrc = crc32c(buffer.subarray(crcEndOffset));
    crcBuffer.writeUInt32BE(correctCrc);

    return buffer;
  }

  private buildRecordBatchItemBuffer(
    recordBatchItem: KafkaClusterMetadataRecordBatchItem
  ): Buffer {
    const lengthBuffer = writeUnsignedVariant(recordBatchItem.length, true);
    const attributesBuffer = this.buildBuffer(
      EByteSize.writeUInt8,
      recordBatchItem.attributes
    );
    const timestampDeltaBuffer = writeUnsignedVariant(
      recordBatchItem.timestampDelta,
      true
    );
    const offsetDeltaBuffer = writeUnsignedVariant(
      recordBatchItem.offsetDelta,
      true
    );
    const keyLenBuffer = writeUnsignedVariant(recordBatchItem.keyLength, true);
    const keyBuffer = Buffer.alloc(0);
    const valueLengthBuffer = writeUnsignedVariant(
      recordBatchItem.valueLength,
      true
    );
    const valueBuffer =
      recordBatchItem.value instanceof Buffer
        ? recordBatchItem.value
        : Buffer.from([]);
    const headerLengthBuffer = writeUnsignedVariant(
      recordBatchItem.headersLength,
      true
    );
    const headerBuffer = Buffer.alloc(0);

    return Buffer.concat([
      lengthBuffer,
      attributesBuffer,
      timestampDeltaBuffer,
      offsetDeltaBuffer,
      keyLenBuffer,
      keyBuffer,
      valueLengthBuffer,
      valueBuffer,
      headerLengthBuffer,
      headerBuffer,
    ]);
  }

  private buildTopicsArrOfBuffers(
    header: IKafkaRequestDescribePartitions
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
          this.buildTopicPartitionRecordBuffer(partitionRecord, index)
      );

      return this.buildTopicBuffer(
        errorCode,
        topic.topicName.length,
        topic.topicName,
        topicIdBuf,
        metaFilePartitionRecords.length,
        partitionRecordsResponseBuffer
      );
    });
  }

  private buildTopicBuffer(
    errorCode: EErrorCode,
    topicNameLen: number,
    topicNameBuf: Buffer,
    topicIdBuf: Buffer,
    topicPartitionsLenBuf: number,
    topicPartitionsBuf: Buffer[]
  ): Buffer {
    const topicErrorCodeBuf: Buffer = this.buildBuffer(
      EByteSize.writeInt16BE,
      errorCode
    );

    const topicNameLenBuf = writeUnsignedVariant(topicNameLen + 1, false);

    const topicIsInternalBuf = this.buildBuffer(EByteSize.writeInt8, 0);

    const partitionsArrayLengthBuf = writeUnsignedVariant(
      topicPartitionsLenBuf + 1,
      false
    );

    const topicAuthorizationOperations = this.buildBuffer(
      EByteSize.writeInt32BE,
      0x00000df8
    );

    const topicTagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);

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

  private buildTopicPartitionRecordBuffer(
    partitionRecord: KafkaClusterMetadataPartitionRecord,
    index: number
  ): Buffer {
    const errorCodeBuffer = this.buildBuffer(
      EByteSize.writeInt16BE,
      EErrorCode.NO_ERROR
    );

    const partitionIndexBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      index
    );

    const leaderIdBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      partitionRecord.leader
    );

    const leaderEpochBuffer = this.buildBuffer(
      EByteSize.writeInt32BE,
      partitionRecord.leaderEpoch
    );

    const replicaLength = partitionRecord.replicas.length;
    const replicaLengthBuffer = writeUnsignedVariant(replicaLength + 1, false); // +1 for the length byte

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
    const isrLengthBuffer = writeUnsignedVariant(isrLength + 1, false); // +1 for the length byte
    const isrBuffer = Buffer.alloc(isrLength * this.ISR_ARRAY_ITEM_BUFFER_SIZE);
    isr.forEach((isr, index) => {
      isrBuffer.writeUInt32BE(isr, index * this.ISR_ARRAY_ITEM_BUFFER_SIZE);
    });

    const eligibleReplicas: number[] = [];
    const eligibleReplicasLength = eligibleReplicas.length;
    const eligibleReplicasLengthBuffer = writeUnsignedVariant(
      eligibleReplicasLength + 1,
      false // +1 for the length byte
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
    const lastKnownELRLengthBuffer = writeUnsignedVariant(
      lastKnownELRLength + 1,
      false // +1 for the length byte
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
    const offlineReplicasLengthBuffer = writeUnsignedVariant(
      offlineReplicasLength + 1,
      false // +1 for the length byte
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

    const tagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);

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

  private buildApiVersionsBuffer(apiVersionsList: IApiVersion[]): Buffer {
    const apiVersionsArrOfBuffers = apiVersionsList.map((apiVersion) =>
      this.buildApiVersionBuffer(apiVersion)
    );

    const apiVersionsArrLenBuffer = writeUnsignedVariant(
      apiVersionsList.length + 1,
      false
    );

    return Buffer.concat([apiVersionsArrLenBuffer, ...apiVersionsArrOfBuffers]);
  }

  private buildApiVersionBuffer(apiVersion: IApiVersion): Buffer {
    // API key (int16, 2 bytes)
    const apiKeyBuffer = this.buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.apiKey
    );

    // Min version (int16, 2 bytes)
    const apiMinVersionBuffer = this.buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.minVersion
    );

    // Max version (int16, 2 bytes)
    const apiMaxVersionBuffer = this.buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.maxVersion
    );

    // Tag buffer (optional, 1 bytes, set to 0)
    const tagBuffer = this.buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      apiKeyBuffer,
      apiMinVersionBuffer,
      apiMaxVersionBuffer,
      tagBuffer,
    ]);
  }

  private buildBuffer(bytesToWrite: EByteSize, value: number | bigint): Buffer {
    let buffer = Buffer.alloc(0);

    switch (bytesToWrite) {
      // 1 BYTE
      case EByteSize.writeUInt8:
        if (typeof value !== "number") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(1);
        buffer.writeUInt8(value);
        break;
      case EByteSize.writeInt8:
        if (typeof value !== "number") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(1);
        buffer.writeInt8(value);
        break;

      // 2 BYTES
      case EByteSize.writeUInt16BE:
        if (typeof value !== "number") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(2);
        buffer.writeUInt16BE(value);
        break;
      case EByteSize.writeInt16BE:
        if (typeof value !== "number") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(2);
        buffer.writeInt16BE(value);
        break;

      // 4 BYTES
      case EByteSize.writeUInt32BE:
        if (typeof value !== "number") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value);
        break;
      case EByteSize.writeInt32BE:
        if (typeof value !== "number") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(4);
        buffer.writeInt32BE(value);
        break;

      // 8 BYTES
      case EByteSize.writeBigUInt64BE:
        if (typeof value !== "bigint") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(8);
        buffer.writeBigUInt64BE(value);
        break;
      case EByteSize.writeBigInt64BE:
        if (typeof value !== "bigint") {
          throw new Error("Expected number");
        }

        buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(value);
        break;

      default:
        throw new Error("Unsupported");
    }

    return buffer;
  }
}

const kafkaHandler = new KafkaHandler();

export { kafkaHandler };
