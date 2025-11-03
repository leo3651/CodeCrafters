import type {
  KafkaClusterMetadataLogFile,
  KafkaPartition,
  KafkaTopic,
} from "./metaDataHandler";
import {
  EByteSize,
  EErrorCode,
  ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE,
  ISR_ARRAY_ITEM_BUFFER_SIZE,
  LAST_KNOWN_ELR_ARR_IT_BUF_SIZE,
  OFFLINE_REPLICAS_ARR_IT_BUF_SIZE,
  REPLICAS_ARRAY_ITEM_BUFFER_SIZE,
  type Variant,
} from "./model";
import { buildBuffer, readVariant, writeUnsignedVariant } from "./utils";

export class DescribePartitionsRequest {
  constructor(
    public topics: DescribePartitionsTopic[],
    public partitionLimit: number
  ) {}

  public static parse(data: Buffer): DescribePartitionsRequest {
    let offset: number = 0;

    const topics: DescribePartitionsTopic[] = [];

    const {
      value: numOfTopicsPlusOne,
      length: numOfTopicsPlusOneBufSize,
    }: Variant = readVariant(data.subarray(offset), false);
    offset += numOfTopicsPlusOneBufSize;

    const numOfTopics: number = numOfTopicsPlusOne - 1;

    for (let i = 0; i < numOfTopics; i++) {
      let { value: topicNameLen, length: topicNameLenBufSize }: Variant =
        readVariant(data.subarray(offset), false);
      offset += topicNameLenBufSize;

      topicNameLen--;
      const topicName: Buffer = data.subarray(offset, offset + topicNameLen);

      offset += topicNameLen;
      offset++;

      topics.push(new DescribePartitionsTopic(topicName, topicNameLen));
    }

    const partitionLimit: number = data.readInt32BE(offset);

    return new DescribePartitionsRequest(topics, partitionLimit);
  }
}

export class DescribePartitionsResponse {
  public static create(
    topics: DescribePartitionsTopic[],
    clusterMetadataLogFile: KafkaClusterMetadataLogFile
  ): Buffer {
    const topicThrottleTimeMsBuf: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      0
    );

    const topicsArrLenBuf: Buffer = writeUnsignedVariant(
      topics.length + 1,
      false
    );

    const topicsArrOfBuf: Buffer[] = this.buildTopicsArrOfBuffers(
      topics,
      clusterMetadataLogFile
    );

    const cursorBuf = Buffer.alloc(1);
    cursorBuf.writeUInt8(0xff, 0);

    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      topicThrottleTimeMsBuf,
      topicsArrLenBuf,
      ...topicsArrOfBuf,
      cursorBuf,
      tagBuffer,
    ]);
  }

  private static buildTopicsArrOfBuffers(
    topics: DescribePartitionsTopic[],
    clusterMetadataLogFile: KafkaClusterMetadataLogFile
  ): Buffer[] {
    const metaFileTopics: KafkaTopic[] = clusterMetadataLogFile.getTopics();

    return topics
      .sort((a, b) =>
        a.topicName.toString().localeCompare(b.topicName.toString())
      )
      .flatMap((topic: DescribePartitionsTopic) => {
        const matchingTopicRecord: KafkaTopic | undefined = metaFileTopics.find(
          (metaFileTopic: KafkaTopic) =>
            metaFileTopic.name === topic.topicName.toString()
        );

        const errorCode: EErrorCode = matchingTopicRecord
          ? EErrorCode.NO_ERROR
          : EErrorCode.UNKNOWN_TOPIC_OR_PARTITION;

        const topicIdBuf: Buffer =
          matchingTopicRecord?.uuid || Buffer.alloc(16);

        const metaFilePartitions: KafkaPartition[] =
          clusterMetadataLogFile.getPartitionsMatchTopicUuid(topicIdBuf);

        const partitionsBuffer: Buffer[] = metaFilePartitions.flatMap(
          (partitionRecord: KafkaPartition, index: number) =>
            this.buildPartitionBuffer(partitionRecord, index)
        );

        return this.buildTopicBuffer(
          errorCode,
          topic.topicName.length,
          topic.topicName,
          topicIdBuf,
          metaFilePartitions.length,
          partitionsBuffer
        );
      });
  }

  private static buildPartitionBuffer(
    partition: KafkaPartition,
    index: number
  ): Buffer {
    const errorCodeBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      EErrorCode.NO_ERROR
    );

    const partitionIndexBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      index
    );

    const leaderIdBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      partition.leader
    );

    const leaderEpochBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      partition.leaderEpoch
    );

    const replicaLength: number = partition.replicas.length;
    const replicaLengthBuffer: Buffer = writeUnsignedVariant(
      replicaLength + 1,
      false
    ); // +1 for the length byte

    const replicasBuffer: Buffer = Buffer.alloc(
      replicaLength * REPLICAS_ARRAY_ITEM_BUFFER_SIZE
    );

    partition.replicas.forEach((replica, index) => {
      replicasBuffer.writeUInt32BE(
        replica,
        index * REPLICAS_ARRAY_ITEM_BUFFER_SIZE
      );
    });

    const isr: number[] = [1];
    const isrLength: number = isr.length;
    const isrLengthBuffer: Buffer = writeUnsignedVariant(isrLength + 1, false); // +1 for the length byte
    const isrBuffer: Buffer = Buffer.alloc(
      isrLength * ISR_ARRAY_ITEM_BUFFER_SIZE
    );
    isr.forEach((isr, index) => {
      isrBuffer.writeUInt32BE(isr, index * ISR_ARRAY_ITEM_BUFFER_SIZE);
    });

    const eligibleReplicas: number[] = [];
    const eligibleReplicasLength: number = eligibleReplicas.length;
    const eligibleReplicasLengthBuffer: Buffer = writeUnsignedVariant(
      eligibleReplicasLength + 1,
      false // +1 for the length byte
    );
    const eligibleReplicasBuffer: Buffer = Buffer.alloc(
      eligibleReplicasLength * ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE
    );
    eligibleReplicas.forEach((replica, index) => {
      eligibleReplicasBuffer.writeUInt32BE(
        replica,
        index * ELIGIBLE_REPLICAS_ARR_IT_BUF_SIZE
      );
    });

    const lastKnownELR: number[] = [];
    const lastKnownELRLength: number = lastKnownELR.length;
    const lastKnownELRLengthBuffer: Buffer = writeUnsignedVariant(
      lastKnownELRLength + 1,
      false // +1 for the length byte
    );
    const lastKnownELRBuffer: Buffer = Buffer.alloc(
      lastKnownELRLength * LAST_KNOWN_ELR_ARR_IT_BUF_SIZE
    );
    lastKnownELR.forEach((elr, index) => {
      lastKnownELRBuffer.writeUInt32BE(
        elr,
        index * LAST_KNOWN_ELR_ARR_IT_BUF_SIZE
      );
    });

    const offlineReplicas: number[] = [];
    const offlineReplicasLength: number = offlineReplicas.length;
    const offlineReplicasLengthBuffer: Buffer = writeUnsignedVariant(
      offlineReplicasLength + 1,
      false // +1 for the length byte
    );
    const offlineReplicasBuffer: Buffer = Buffer.alloc(
      offlineReplicasLength * OFFLINE_REPLICAS_ARR_IT_BUF_SIZE
    );
    offlineReplicas.forEach((replica, index) => {
      offlineReplicasBuffer.writeUInt32BE(
        replica,
        index * OFFLINE_REPLICAS_ARR_IT_BUF_SIZE
      );
    });

    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

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

  private static buildTopicBuffer(
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

    const topicNameLenBuf: Buffer = writeUnsignedVariant(
      topicNameLen + 1,
      false
    );

    const topicIsInternalBuf: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    const partitionsArrayLengthBuf: Buffer = writeUnsignedVariant(
      topicPartitionsLenBuf + 1,
      false
    );

    const topicAuthorizationOperations: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      0x00000df8
    );

    const topicTagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

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
}

class DescribePartitionsTopic {
  constructor(public topicName: Buffer, public topicNameLen: number) {}
}
