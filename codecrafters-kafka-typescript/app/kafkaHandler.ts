import { EByteSize, type IKafkaRequestHeader } from "./model";
import { KafkaClusterMetadataLogFile } from "./metaDataHandler";
import { buildBuffer } from "./utils";
import { ProduceRequest, ProduceResponse, Topic } from "./produceApi";
import {
  DescribePartitionsRequest,
  DescribePartitionsResponse,
} from "./describePartitionsApi";
import { FetchRequest, FetchResponse } from "./fetchApi";
import { VersionsResponse } from "./versionApi";

class KafkaHandler {
  private clusterMetadataLogFile!: KafkaClusterMetadataLogFile;

  constructor() {
    const fileLocation: string = process.argv[2];
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

    const messageSize: number = data.readInt32BE();
    const reqApiKey: number = data.readInt16BE(4);
    const reqApiVersion: number = data.readInt16BE(6);
    const correlationID: number = data.readInt32BE(8);
    const clientIDLen: number = data.readInt16BE(12);
    const clientID: Buffer = data.slice(14, 14 + clientIDLen);

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

    const correlationIDBuf: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      correlationID
    );
    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    // 14 - start of clientID + clientIDLength + tagBuffer
    const relevantDataOffset: number = 14 + clientIDLen + 1;

    // Versions
    if (reqApiKey === 18) {
      responseBody = VersionsResponse.createV4ResponseBody(commonHeader);
    }

    // Describe partitions
    else if (reqApiKey === 75) {
      const { topics }: DescribePartitionsRequest =
        DescribePartitionsRequest.parse(data.subarray(relevantDataOffset));

      responseBody = Buffer.concat([
        correlationIDBuf,
        tagBuffer,
        DescribePartitionsResponse.create(topics, this.clusterMetadataLogFile),
      ]);
    }

    // Fetch
    else if (reqApiKey === 1) {
      const { topics }: FetchRequest = FetchRequest.parse(
        data.subarray(relevantDataOffset)
      );

      responseBody = Buffer.concat([
        correlationIDBuf,
        tagBuffer,
        FetchResponse.create(topics, this.clusterMetadataLogFile),
      ]);
    }

    // Produce
    else if (reqApiKey === 0) {
      const topics: Topic[] = ProduceRequest.parse(
        data.subarray(relevantDataOffset)
      );

      responseBody = Buffer.concat([
        correlationIDBuf,
        tagBuffer,
        ProduceResponse.create(topics, this.clusterMetadataLogFile),
      ]);
    }

    const mesLenBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      responseBody.length
    );

    return Buffer.concat([mesLenBuffer, responseBody]);
  }
}

const kafkaHandler: KafkaHandler = new KafkaHandler();

export { kafkaHandler };
