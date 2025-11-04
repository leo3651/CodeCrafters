import { KafkaPartitionLogFile } from "./kafkaPartitionsLogFile";
import {
  KafkaClusterMetadataLogFile,
  KafkaPartition,
  KafkaTopic,
  KafkaRecordBatch,
} from "./metaDataHandler";
import { EByteSize, EErrorCode, type Variant } from "./model";
import { buildBuffer, readVariant, writeUnsignedVariant } from "./utils";

export class ProduceRequest {
  constructor(public topics: Topic[]) {}

  public static parse(buffer: Buffer): Topic[] {
    let offset: number = 0;

    const { value: transactionalID, length: transactionalIDBufSize }: Variant =
      readVariant(buffer.subarray(offset), false);
    offset += transactionalIDBufSize;

    const acks: number = buffer.readInt16BE(offset);
    offset += 2;

    const timeout: number = buffer.readInt32BE(offset);
    offset += 4;

    const { value: numOfTopicsPlusOne, length: numOfTopicsBufSize }: Variant =
      readVariant(buffer.subarray(offset), false);
    offset += numOfTopicsBufSize;
    const numOfTopics = numOfTopicsPlusOne - 1;

    const topics: Topic[] = [];

    for (let i = 0; i < numOfTopics; i++) {
      const topic: Topic = Topic.parseProduceTopic(buffer.subarray(offset));
      topics.push(topic);

      offset += topic.bufferSize();
    }

    offset++; // TagBuffer

    return topics;
  }
}

export class ProduceResponse {
  public static create(
    topics: Topic[],
    clusterMetadataLogFile: KafkaClusterMetadataLogFile
  ): Buffer {
    const topicsArrLenBuf: Buffer = writeUnsignedVariant(
      topics.length + 1,
      false
    );

    const topicsBuf: Buffer[] = topics.flatMap((topic: Topic) => {
      const topicNameLenBuf: Buffer = writeUnsignedVariant(
        topic.topicNameLenPlusOne,
        false
      );
      const topicNameBuf: Buffer = Buffer.from(topic.topicName);
      const partitionsArrLenBuf: Buffer = writeUnsignedVariant(
        topic.partitions.length + 1,
        false
      );

      let partitionsBuf: Buffer = Buffer.alloc(0);
      for (let i = 0; i < topic.partitions.length; i++) {
        const partition: Partition = topic.partitions[i];
        const partitionValid: boolean = this.partitionValid(
          clusterMetadataLogFile,
          topic,
          partition
        );

        partitionsBuf = Buffer.concat([
          partitionsBuf,
          this.createPartitionBuffer(partition, partitionValid),
        ]);
      }

      const tagBuf: Buffer = buildBuffer(EByteSize.writeInt8, 0);

      return Buffer.concat([
        topicNameLenBuf,
        topicNameBuf,
        partitionsArrLenBuf,
        partitionsBuf,
        tagBuf,
      ]);
    });

    const throttleTimeBuffer: Buffer = buildBuffer(EByteSize.writeInt32BE, 0);
    const tagBuf: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      topicsArrLenBuf,
      ...topicsBuf,
      throttleTimeBuffer,
      tagBuf,
    ]);
  }

  private static partitionValid(
    clusterMetadataLogFile: KafkaClusterMetadataLogFile,
    topic: Topic,
    partition: Partition
  ): boolean {
    let topicAndPartitionExists: boolean = false;
    const existingTopics: KafkaTopic[] = clusterMetadataLogFile.getTopics();
    const topicFromDisk: KafkaTopic | undefined = existingTopics.find(
      (existingTopic) => existingTopic.name === topic.topicName
    );

    if (topicFromDisk) {
      const partitions: KafkaPartition[] =
        clusterMetadataLogFile.getPartitionsMatchTopicUuid(topicFromDisk.uuid);
      topicAndPartitionExists = partitions.some(
        (partitionFromDisk) =>
          partitionFromDisk.partitionId === partition.partitionIndex
      );
    }
    if (topicAndPartitionExists) {
      this.writeDataToFile(topic, partition);
    }

    return topicAndPartitionExists;
  }

  private static writeDataToFile(topic: Topic, partition: Partition) {
    KafkaPartitionLogFile.write(
      topic.topicName,
      partition.partitionIndex,
      partition.recordBatch
    );
  }

  private static createPartitionBuffer(
    partition: Partition,
    partitionValid: boolean
  ) {
    const partitionIndexBuf = buildBuffer(
      EByteSize.writeInt32BE,
      partition.partitionIndex
    );

    const errorCodeBuf = buildBuffer(
      EByteSize.writeInt16BE,
      partitionValid
        ? EErrorCode.NO_ERROR
        : EErrorCode.UNKNOWN_TOPIC_OR_PARTITION
    );

    const baseOffsetBuf = buildBuffer(
      EByteSize.writeBigInt64BE,
      partitionValid ? 0n : -1n
    );
    const logAppendBuf = buildBuffer(EByteSize.writeBigInt64BE, -1n);
    const logStartBuf = buildBuffer(
      EByteSize.writeBigInt64BE,
      partitionValid ? 0n : -1n
    );

    const recordsErrArrLenBuf = buildBuffer(EByteSize.writeUInt8, 1);
    const errorMessBuf = buildBuffer(EByteSize.writeUInt8, 0);
    const tagBuf = buildBuffer(EByteSize.writeUInt8, 0);

    return Buffer.concat([
      partitionIndexBuf,
      errorCodeBuf,
      baseOffsetBuf,
      logAppendBuf,
      logStartBuf,
      recordsErrArrLenBuf,
      errorMessBuf,
      tagBuf,
    ]);
  }
}

export class Topic {
  constructor(
    public topicNameLenPlusOne: number,
    public topicName: string,
    public partitions: Partition[],
    public topicBufSize: number
  ) {}

  public static parseProduceTopic(buffer: Buffer): Topic {
    let offset: number = 0;

    const {
      value: topicNameLenPlusOne,
      length: topicNameLengthBufSize,
    }: Variant = readVariant(buffer.subarray(offset), false);
    offset += topicNameLengthBufSize;
    const topicNameLen: number = topicNameLenPlusOne - 1;

    const topicName: string = buffer
      .subarray(offset, offset + topicNameLen)
      .toString();
    offset += topicNameLen;

    const {
      value: partitionsArrLenPlusOne,
      length: partitionsArrLenBufSize,
    }: Variant = readVariant(buffer.subarray(offset), false);
    offset += partitionsArrLenBufSize;
    const partitionsArrLen: number = partitionsArrLenPlusOne - 1;

    const partitions: Partition[] = [];

    for (let i = 0; i < partitionsArrLen; i++) {
      const partition: Partition = Partition.parseProducePartition(
        buffer.subarray(offset)
      );
      partitions.push(partition);
      offset += partition.bufferSize();
    }

    offset++; // TagBuffer

    return new Topic(topicNameLenPlusOne, topicName, partitions, offset);
  }

  public bufferSize() {
    return this.topicBufSize;
  }
}

class Partition {
  constructor(
    public partitionIndex: number,
    public recordBatch: KafkaRecordBatch[],
    public partitionBufferSize: number
  ) {}

  public static parseProducePartition(buffer: Buffer): Partition {
    let offset: number = 0;

    const partitionIndex: number = buffer.subarray(offset).readUInt32BE();
    offset += 4;

    const { value: batchesLength, length: batchesLengthBufSize }: Variant =
      readVariant(buffer.subarray(offset), false);
    offset += batchesLengthBufSize;

    const recordBatches: KafkaRecordBatch[] = [];

    while (offset < batchesLength) {
      const recordBatch: KafkaRecordBatch = KafkaRecordBatch.fromBuffer(
        buffer.subarray(offset)
      );
      recordBatches.push(recordBatch);

      offset += recordBatch.bufferSize();
    }

    offset++; // TagBuffer

    return new Partition(partitionIndex, recordBatches, offset);
  }

  public bufferSize(): number {
    return this.partitionBufferSize;
  }
}
