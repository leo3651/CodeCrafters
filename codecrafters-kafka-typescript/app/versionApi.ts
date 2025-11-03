import {
  EByteSize,
  EErrorCode,
  type IApiVersion,
  type IKafkaRequestHeader,
} from "./model";
import { buildBuffer, writeUnsignedVariant } from "./utils";

export class VersionsResponse {
  private static SUPPORTED_API_VERSIONS: number[] = [0, 1, 2, 3, 4];

  public static createV4ResponseBody(header: IKafkaRequestHeader): Buffer {
    let errorCode: EErrorCode = EErrorCode.NO_ERROR;

    if (!this.SUPPORTED_API_VERSIONS.includes(header.reqApiVersion)) {
      errorCode = EErrorCode.UNSUPPORTED_VERSION;
    }

    const correlationIDBuffer: Buffer = buildBuffer(
      EByteSize.writeInt32BE,
      header.correlationID
    );

    const errorCodeBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      errorCode
    );

    const apiVersionBuffer: Buffer = this.buildApiVersionsBuffer([
      { apiKey: header.reqApiKey, maxVersion: 4, minVersion: 0 },
      { apiKey: 75, maxVersion: 0, minVersion: 0 },
      { apiKey: 1, maxVersion: 16, minVersion: 0 },
      { apiKey: 0, maxVersion: 11, minVersion: 0 },
    ]);

    const throttleTimeBuffer: Buffer = buildBuffer(EByteSize.writeInt32BE, 0);

    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      correlationIDBuffer,
      errorCodeBuffer,
      apiVersionBuffer,
      throttleTimeBuffer,
      tagBuffer,
    ]);
  }

  public static buildApiVersionsBuffer(apiVersionsList: IApiVersion[]): Buffer {
    const apiVersionsArrOfBuffers: Buffer[] = apiVersionsList.map(
      (apiVersion: IApiVersion) => this.buildApiVersionBuffer(apiVersion)
    );

    const apiVersionsArrLenBuffer: Buffer = writeUnsignedVariant(
      apiVersionsList.length + 1,
      false
    );

    return Buffer.concat([apiVersionsArrLenBuffer, ...apiVersionsArrOfBuffers]);
  }

  private static buildApiVersionBuffer(apiVersion: IApiVersion): Buffer {
    // API key (int16, 2 bytes)
    const apiKeyBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.apiKey
    );

    // Min version (int16, 2 bytes)
    const apiMinVersionBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.minVersion
    );

    // Max version (int16, 2 bytes)
    const apiMaxVersionBuffer: Buffer = buildBuffer(
      EByteSize.writeInt16BE,
      apiVersion.maxVersion
    );

    // Tag buffer (optional, 1 bytes, set to 0)
    const tagBuffer: Buffer = buildBuffer(EByteSize.writeInt8, 0);

    return Buffer.concat([
      apiKeyBuffer,
      apiMinVersionBuffer,
      apiMaxVersionBuffer,
      tagBuffer,
    ]);
  }
}
