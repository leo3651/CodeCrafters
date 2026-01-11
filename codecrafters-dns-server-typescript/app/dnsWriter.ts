import type { DnsHeader } from "./model";
import { getRecordClassBuffer, getRecordTypeBuffer } from "./utils";

export class DnsWriter {
  constructor() {}

  public static createDnsHeader({
    packetId = -9999,
    isResponse = true,
    operationCode = 0,
    isAuthoritativeAnswer = false,
    largerThan512Bytes = false,
    isRecursionDesired = false,
    isRecursionAvailable = false,
    responseCode = 0,
    questionCount = 0,
    answerRecordCount = 0,
    authorityRecordCount = 0,
    additionalRecordCount = 0,
  }: DnsHeader): Buffer {
    let dnsHeader: Buffer = Buffer.alloc(12);
    let byte1: number;
    let byte0: number;

    // Packet ID - 16 bit
    if (packetId === -9999) {
      throw new Error("Invalid packet ID");
    }

    byte1 = packetId & 0xff;
    byte0 = (packetId >> 8) & 0xff;

    dnsHeader[0] = byte0;
    dnsHeader[1] = byte1;

    // QR - 1 bit, OPCODE - 4 bits, AA - 1 bit, TC - 1 bit, RD - 1 bit
    let byte2: number = 0;
    if (isResponse) byte2 |= 0b10000000;
    byte2 |= operationCode;
    if (isAuthoritativeAnswer) byte2 |= 0b00000100;
    if (!isResponse && largerThan512Bytes) byte2 |= 0b00000010;
    if (isRecursionDesired) byte2 |= 0b00000001;

    dnsHeader[2] = byte2;

    // RA - 1 bit, Z - 3 bits. RCODE
    let byte3: number = 0;
    if (isRecursionAvailable) byte3 |= 0b10000000;
    // Reserved bytes always 0
    byte3 |= responseCode;

    dnsHeader[3] = byte3;

    // QDCOUNT
    let byte5: number = 0;
    let byte4: number = 0;
    byte5 |= questionCount & 0xff;
    byte4 |= (questionCount >> 8) & 0xff;

    dnsHeader[4] = byte4;
    dnsHeader[5] = byte5;

    // ANCOUNT
    let byte7: number = 0;
    let byte6: number = 0;
    byte7 |= answerRecordCount & 0xff;
    byte6 |= (answerRecordCount >> 8) & 0xff;

    dnsHeader[6] = byte6;
    dnsHeader[7] = byte7;

    // NSCOUNT
    let byte9: number = 0;
    let byte8: number = 0;
    byte9 |= authorityRecordCount & 0xff;
    byte8 |= (authorityRecordCount >> 8) & 0xff;

    dnsHeader[8] = byte8;
    dnsHeader[9] = byte9;

    // ARCOUNT
    let byte11: number = 0;
    let byte10: number = 0;
    byte11 |= additionalRecordCount & 0xff;
    byte10 |= (additionalRecordCount >> 8) & 0xff;

    dnsHeader[10] = byte10;
    dnsHeader[11] = byte11;

    return dnsHeader;
  }

  public static createQuestionSection(
    domainName: string,
    questionType: string,
    questionClass: number
  ): Buffer {
    const questionTypeBuffer: Buffer = getRecordTypeBuffer(questionType);
    const questionClassBuffer: Buffer = getRecordClassBuffer(questionClass);
    const encodedDomainNameBuffer: Buffer = Buffer.from(
      this.encodeDomainName(domainName),
      "binary"
    );

    return Buffer.concat([
      new Uint8Array(encodedDomainNameBuffer),
      new Uint8Array(questionTypeBuffer),
      new Uint8Array(questionClassBuffer),
    ]);
  }

  public static createAnswerSection(
    domainName: string,
    answerType: string,
    answerClass: number,
    timeToLive: number,
    rData: string
  ): Buffer {
    const encodedDomainNameBuffer: Buffer = Buffer.from(
      this.encodeDomainName(domainName)
    );
    const answerTypeBuffer: Buffer = getRecordTypeBuffer(answerType);
    const answerClassBuffer: Buffer = getRecordClassBuffer(answerClass);
    const timeToLiveBuffer: Buffer = Buffer.alloc(4);
    timeToLiveBuffer.writeUInt32BE(timeToLive, 0);
    const rDataLengthBuffer: Buffer = Buffer.alloc(2);
    rDataLengthBuffer.writeUInt16BE(rData.length, 0);
    const rDataBuffer: Buffer = Buffer.from(rData, "binary");

    return Buffer.concat([
      new Uint8Array(encodedDomainNameBuffer),
      new Uint8Array(answerTypeBuffer),
      new Uint8Array(answerClassBuffer),
      new Uint8Array(timeToLiveBuffer),
      new Uint8Array(rDataLengthBuffer),
      new Uint8Array(rDataBuffer),
    ]);
  }

  private static encodeDomainName(domainName: string): string {
    return (
      domainName
        .split(".")
        .filter((label) => label.trim() !== "")
        .map((label) => `${String.fromCharCode(label.length)}${label}`)
        .join("") + "\0"
    );
  }
}
