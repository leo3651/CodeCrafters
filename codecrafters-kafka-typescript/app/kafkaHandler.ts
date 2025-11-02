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
  KafkaPartition,
  KafkaRecordBatch,
  KafkaRecord,
  KafkaTopic,
} from "./metaDataParser";
import {
  buildBuffer,
  crc32c,
  readVariant,
  writeUnsignedVariant,
} from "./utils";
import { KafkaPartitionLogFile } from "./kafkaPartitionsLogFile";
import { ProduceRequest, ProduceResponse, Topic } from "./produceApi";

class KafkaHandler {
  private clusterMetadataLogFile!: KafkaClusterMetadataLogFile;

  private SUPPORTED_API_VERSIONS: number[] = [0, 1, 2, 3, 4];

  private readonly REPLICAS_ARRAY_ITEM_BUFFER_SIZE: number = 4;
  private readonly ISR_ARRAY_ITEM_BUFFER_SIZE: number = 4;
  private readonly ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE: number = 4;
  private readonly LAST_KNOWN_ELR_ARR_IT_BUF_SIZE: number = 4;
  private readonly OFFLINE_REPLICAS_ARR_IT_BUF_SIZE: number = 4;

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

    // Produce
    else if (reqApiKey === 0) {
      const topics: Topic[] = ProduceRequest.from(
        data.subarray(relevantDataOffset)
      );
      const correlationIDBuf = buildBuffer(
        EByteSize.writeInt32BE,
        correlationID
      );
      const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);

      responseBody = Buffer.concat([
        correlationIDBuf,
        tagBuffer,
        ProduceResponse.responseFrom(topics, this.clusterMetadataLogFile),
      ]);
    }

    const mesLenBuffer = buildBuffer(
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

    const correlationIDBuffer = buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );

    const errorCodeBuffer = buildBuffer(EByteSize.writeInt16BE, errorCode);

    const apiVersionBuffer = this.buildApiVersionsBuffer([
      { apiKey: header.reqApiKey, maxVersion: 4, minVersion: 0 },
      { apiKey: 75, maxVersion: 0, minVersion: 0 },
      { apiKey: 1, maxVersion: 16, minVersion: 0 },
      { apiKey: 0, maxVersion: 11, minVersion: 0 },
    ]);

    const throttleTimeBuffer = buildBuffer(EByteSize.writeInt32BE, 0);

    const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);

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
    const correlationIDBuf = buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );

    const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);

    const topicThrottleTimeMsBuf = buildBuffer(EByteSize.writeInt32BE, 0);

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
          const matchedTopicRecord = this.clusterMetadataLogFile.getMatchTopic(
            topicReq.topicId
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

    const correlationIDBuffer = buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );
    const throttleTimeBuffer = buildBuffer(
      EByteSize.writeInt32BE,
      throttleTime
    );
    const errorCodeBuffer = buildBuffer(EByteSize.writeInt16BE, errorCode);
    const sessionIdBuffer = buildBuffer(EByteSize.writeInt32BE, sessionId);
    const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);
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
    topic: KafkaTopic | undefined
  ): Buffer {
    let records: KafkaRecordBatch[] = [];

    const errorCode = topic ? EErrorCode.NO_ERROR : EErrorCode.UNKNOWN_TOPIC;

    if (errorCode === EErrorCode.NO_ERROR) {
      const recordLogFile = KafkaPartitionLogFile.fromFile(
        `/tmp/kraft-combined-logs/${
          topic!.name
        }-${partitionId}/00000000000000000000.log`
      );
      records = recordLogFile.getRecords();
    }

    const totalRecordsSize = records.reduce(
      (total, record) => total + record.bufferSize(),
      0
    );

    const compactRecordsLengthBuffer = writeUnsignedVariant(
      totalRecordsSize + 1,
      false
    );
    const partitionIndexBuffer = buildBuffer(
      EByteSize.writeInt32BE,
      partitionId
    );
    const errorCodeBuffer = buildBuffer(EByteSize.writeInt16BE, errorCode);
    const highWaterMarkBuffer = buildBuffer(EByteSize.writeBigUInt64BE, 0n);
    const lastStableOffsetBuffer = buildBuffer(EByteSize.writeBigUInt64BE, 0n);
    const logStartOffsetBuffer = buildBuffer(EByteSize.writeBigUInt64BE, 0n);
    const abortedTransactionsBuffer = writeUnsignedVariant(0, false);
    const preferredReadReplicasBuffer = buildBuffer(EByteSize.writeInt32BE, 0);
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
    const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      topicId,
      numOfPartitionsBuffer,
      ...partitions,
      tagBuffer,
    ]);
  }

  private buildRecordBatchBuffer(recordBatch: KafkaRecordBatch): Buffer {
    const baseOffsetBuffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.baseOffset
    );
    const batchLengthBuffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.batchLength
    );
    const partitionLeaderEpochBuffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.partitionLeaderEpoch
    );
    const magicByteBuffer = buildBuffer(
      EByteSize.writeUInt8,
      recordBatch.magicByte
    );
    const crcBuffer = buildBuffer(EByteSize.writeUInt32BE, recordBatch.crc);
    const attributesBuffer = buildBuffer(
      EByteSize.writeUInt16BE,
      recordBatch.attributes
    );
    const lastOffsetDeltaBuffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.lastOffsetDelta
    );
    const baseTimestampBuffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.baseTimestamp
    );
    const maxTimestampBuffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.maxTimestamp
    );
    const producerIdBuffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.producerId
    );
    const producerEpochBuffer = buildBuffer(
      EByteSize.writeUInt16BE,
      recordBatch.producerEpoch
    );
    const baseSequenceBuffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.baseSequence
    );
    const recordCountBuffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.recordCount
    );
    const arrOfRecordBatchItemsBuffer = recordBatch.records.map(
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

  private buildRecordBatchItemBuffer(recordBatchItem: KafkaRecord): Buffer {
    const lengthBuffer = writeUnsignedVariant(recordBatchItem.length, true);
    const attributesBuffer = buildBuffer(
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
    const keyValBuffer: Buffer = recordBatchItem.keyValue || Buffer.alloc(0);

    const valueLengthBuffer = writeUnsignedVariant(
      recordBatchItem.valueLength,
      true
    );
    const valueBuffer =
      recordBatchItem.value instanceof Buffer
        ? recordBatchItem.value
        : Buffer.alloc(0);

    const headerLengthBuffer = writeUnsignedVariant(
      recordBatchItem.headersLength,
      true
    );
    let headersBuffer = Buffer.alloc(0);

    if (recordBatchItem.headersLength > 0) {
      for (let i = 0; i < recordBatchItem.headersLength; i++) {
        const hKeyLenBuf = writeUnsignedVariant(
          recordBatchItem.headers[i].hKeyLen,
          true
        );
        const hKey: Buffer = recordBatchItem.headers[i].hKey || Buffer.alloc(0);

        const hKeyValLenBuf = writeUnsignedVariant(
          recordBatchItem.headers[i].hKeyValLen,
          true
        );
        const hKeyVal: Buffer =
          recordBatchItem.headers[i].hKeyVal || Buffer.alloc(0);

        const header = Buffer.concat([
          hKeyLenBuf,
          hKey,
          hKeyValLenBuf,
          hKeyVal,
        ]);

        headersBuffer = Buffer.concat([headersBuffer, header]);
      }
    }

    return Buffer.concat([
      lengthBuffer,
      attributesBuffer,
      timestampDeltaBuffer,
      offsetDeltaBuffer,
      keyLenBuffer,
      keyValBuffer,
      valueLengthBuffer,
      valueBuffer,
      headerLengthBuffer,
      headersBuffer,
    ]);
  }

  private buildTopicsArrOfBuffers(
    header: IKafkaRequestDescribePartitions
  ): Buffer[] {
    const metaFileTopicRecords = this.clusterMetadataLogFile.getTopics();

    return header.topics
      .sort((a, b) =>
        a.topicName.toString().localeCompare(b.topicName.toString())
      )
      .flatMap((topic) => {
        const matchingTopicRecord = metaFileTopicRecords.find(
          (metaFileTopic) => metaFileTopic.name === topic.topicName.toString()
        );

        const errorCode = matchingTopicRecord
          ? EErrorCode.NO_ERROR
          : EErrorCode.UNKNOWN_TOPIC_OR_PARTITION;

        const topicIdBuf = matchingTopicRecord?.uuid || Buffer.alloc(16);

        const metaFilePartitionRecords =
          this.clusterMetadataLogFile.getPartitionsMatchTopicUuid(topicIdBuf);
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
    const topicErrorCodeBuf: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      errorCode
    );

    const topicNameLenBuf = writeUnsignedVariant(topicNameLen + 1, false);

    const topicIsInternalBuf = buildBuffer(EByteSize.writeInt8, 0);

    const partitionsArrayLengthBuf = writeUnsignedVariant(
      topicPartitionsLenBuf + 1,
      false
    );

    const topicAuthorizationOperations = buildBuffer(
      EByteSize.writeInt32BE,
      0x00000df8
    );

    const topicTagBuffer = buildBuffer(EByteSize.writeInt8, 0);

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
    partitionRecord: KafkaPartition,
    index: number
  ): Buffer {
    const errorCodeBuffer = buildBuffer(
      EByteSize.writeInt16BE,
      EErrorCode.NO_ERROR
    );

    const partitionIndexBuffer = buildBuffer(EByteSize.writeInt32BE, index);

    const leaderIdBuffer = buildBuffer(
      EByteSize.writeInt32BE,
      partitionRecord.leader
    );

    const leaderEpochBuffer = buildBuffer(
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

    const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);

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
    const apiKeyBuffer = buildBuffer(EByteSize.writeInt16BE, apiVersion.apiKey);

    // Min version (int16, 2 bytes)
    const apiMinVersionBuffer = buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.minVersion
    );

    // Max version (int16, 2 bytes)
    const apiMaxVersionBuffer = buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.maxVersion
    );

    // Tag buffer (optional, 1 bytes, set to 0)
    const tagBuffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      apiKeyBuffer,
      apiMinVersionBuffer,
      apiMaxVersionBuffer,
      tagBuffer,
    ]);
  }
}

const kafkaHandler = new KafkaHandler();

export { kafkaHandler };
