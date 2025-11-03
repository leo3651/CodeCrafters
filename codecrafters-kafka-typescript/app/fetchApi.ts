import { KafkaPartitionLogFile } from "./kafkaPartitionsLogFile";
import {
  KafkaRecordBatch,
  type KafkaClusterMetadataLogFile,
  type KafkaTopic,
} from "./metaDataHandler";
import { EByteSize, EErrorCode, type Variant } from "./model";
import { buildBuffer, readVariant, writeUnsignedVariant } from "./utils";

export class FetchRequest {
  constructor(public topics: FetchTopic[]) {}

  public static parse(data: Buffer): FetchRequest {
    let offset: number = 0;

    const maxWaitTime: number = data.readUInt32BE(offset);
    offset += 4;
    const minBytes: number = data.readUInt32BE(offset);
    offset += 4;
    const maxBytes: number = data.readUInt32BE(offset);
    offset += 4;
    const isolationLevel: number = data.readUInt8(offset);
    offset += 1;
    const sessionId: number = data.readUInt32BE(offset);
    offset += 4;
    const sessionEpoch: number = data.readUInt32BE(offset);
    offset += 4;

    const {
      value: numOfTopicsPlusOne,
      length: numOfTopicsBufferLength,
    }: Variant = readVariant(data.subarray(offset), false);
    offset += numOfTopicsBufferLength;

    const numOfTopics: number = numOfTopicsPlusOne - 1;

    let topics: FetchTopic[] = [];

    for (let i = 0; i < numOfTopics; i++) {
      const topic: FetchTopic = this.parseFetchTopic(data.subarray(offset));
      offset += topic.bufferSize;
      topics.push(topic);
    }

    return new FetchRequest(topics);
  }

  private static parseFetchTopic(data: Buffer): FetchTopic {
    let offset: number = 0;

    const topicId: Buffer = data.subarray(offset, offset + 16);
    offset += 16;

    const {
      value: numOfPartitionsPlusOne,
      length: numOfPartitionsBufferLength,
    }: Variant = readVariant(data.subarray(offset), false);

    offset += numOfPartitionsBufferLength;
    const numOfPartitions: number = numOfPartitionsPlusOne - 1;

    let partitionsIDsArr: number[] = [];

    for (let i = 0; i < numOfPartitions; i++) {
      const partitionId: number = data.readUInt32BE(offset);
      offset += 4;

      partitionsIDsArr.push(partitionId);
    }
    const bufferSize: number =
      16 + numOfPartitionsBufferLength + numOfPartitions * 4;

    const topicItem: FetchTopic = new FetchTopic(
      partitionsIDsArr,
      topicId,
      bufferSize
    );

    return topicItem;
  }
}

export class FetchResponse {
  public static create(
    topics: FetchTopic[],
    clusterMetadataLogFile: KafkaClusterMetadataLogFile
  ): Buffer {
    const topicsInResponse: Buffer[] = topics.map((fetchTopic: FetchTopic) => {
      const partitionsBuf: Buffer[] = fetchTopic.partitionsIndexes.map(
        (partitionId: number) => {
          const matchedTopicRecord: KafkaTopic | undefined =
            clusterMetadataLogFile.getMatchTopic(fetchTopic.topicId);

          return this.buildFetchPartitionBuffer(
            partitionId,
            matchedTopicRecord
          );
        }
      );

      const topic: Buffer = this.buildFetchTopicBuffer(
        fetchTopic.topicId, // topicId
        partitionsBuf
      );

      return topic;
    });

    const throttleTimeBuffer: Buffer = buildBuffer(EByteSize.writeInt32BE, 0);
    const errorCodeBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      EErrorCode.NO_ERROR
    );
    const sessionIdBuffer: Buffer = buildBuffer(EByteSize.writeInt32BE, 0);
    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);
    const numResponsesBuffer: Buffer = writeUnsignedVariant(
      topicsInResponse.length + 1,
      false
    );

    return Buffer.concat([
      throttleTimeBuffer,
      errorCodeBuffer,
      sessionIdBuffer,
      numResponsesBuffer,
      ...topicsInResponse,
      tagBuffer,
    ]);
  }

  private static buildFetchTopicBuffer(
    topicId: Buffer,
    partitions: Buffer[]
  ): Buffer {
    const numOfPartitionsBuffer: Buffer = writeUnsignedVariant(
      partitions.length + 1,
      false
    );
    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      topicId,
      numOfPartitionsBuffer,
      ...partitions,
      tagBuffer,
    ]);
  }

  private static buildFetchPartitionBuffer(
    partitionId: number,
    topic: KafkaTopic | undefined
  ): Buffer {
    let records: KafkaRecordBatch[] = [];

    const errorCode: EErrorCode = topic
      ? EErrorCode.NO_ERROR
      : EErrorCode.UNKNOWN_TOPIC;

    if (errorCode === EErrorCode.NO_ERROR) {
      const recordLogFile: KafkaPartitionLogFile =
        KafkaPartitionLogFile.fromFile(
          `/tmp/kraft-combined-logs/${
            topic!.name
          }-${partitionId}/00000000000000000000.log`
        );
      records = recordLogFile.getRecords();
    }

    const totalRecordsSize: number = records.reduce(
      (total, record) => total + record.bufferSize(),
      0
    );

    const compactRecordsLengthBuffer: Buffer = writeUnsignedVariant(
      totalRecordsSize + 1,
      false
    );
    const partitionIndexBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      partitionId
    );
    const errorCodeBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      errorCode
    );
    const highWaterMarkBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      0n
    );
    const lastStableOffsetBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      0n
    );
    const logStartOffsetBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      0n
    );
    const abortedTransactionsBuffer: Buffer = writeUnsignedVariant(0, false);
    const preferredReadReplicasBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      0
    );
    const tagFieldsArrayLengthBuffer: Buffer = writeUnsignedVariant(0, false);

    const recordsBuffer: Buffer[] = records.map((record: KafkaRecordBatch) =>
      KafkaRecordBatch.buildRecordBatchBuffer(record)
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
}

export class FetchTopic {
  constructor(
    public partitionsIndexes: number[],
    public topicId: Buffer,
    public bufferSize: number
  ) {}
}
