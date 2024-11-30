import type { DnsHeader } from "./model";
import { getRecordClassBuffer, getRecordTypeBuffer } from "./utils";

export class DnsHandler {
  constructor() {}

  createDnsHeader({
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
    let byte2 = 0;
    if (isResponse) byte2 |= 0b10000000;
    byte2 |= operationCode;
    if (isAuthoritativeAnswer) byte2 |= 0b00000100;
    if (!isResponse && largerThan512Bytes) byte2 |= 0b00000010;
    if (isRecursionDesired) byte2 |= 0b00000001;

    dnsHeader[2] = byte2;

    // RA - 1 bit, Z - 3 bits. RCODE
    let byte3 = 0;
    if (isRecursionAvailable) byte3 |= 0b10000000;
    // Reserved bytes always 0
    byte3 |= responseCode;

    dnsHeader[3] = byte3;

    // QDCOUNT
    let byte5 = 0;
    let byte4 = 0;
    byte5 |= questionCount & 0xff;
    byte4 |= (questionCount >> 8) & 0xff;

    dnsHeader[4] = byte4;
    dnsHeader[5] = byte5;

    // ANCOUNT
    let byte7 = 0;
    let byte6 = 0;
    byte7 |= answerRecordCount & 0xff;
    byte6 |= (answerRecordCount >> 8) & 0xff;

    dnsHeader[6] = byte6;
    dnsHeader[7] = byte7;

    // NSCOUNT
    let byte9 = 0;
    let byte8 = 0;
    byte9 |= authorityRecordCount & 0xff;
    byte8 |= (authorityRecordCount >> 8) & 0xff;

    dnsHeader[8] = byte8;
    dnsHeader[9] = byte9;

    // ARCOUNT
    let byte11 = 0;
    let byte10 = 0;
    byte11 |= additionalRecordCount & 0xff;
    byte10 |= (additionalRecordCount >> 8) & 0xff;

    dnsHeader[10] = byte10;
    dnsHeader[11] = byte11;

    console.log(dnsHeader);

    return dnsHeader;
  }

  createQuestionSection(
    domainName: string,
    questionType: string,
    questionClass: number
  ): Buffer {
    const questionTypeBuffer = getRecordTypeBuffer(questionType);
    const questionClassBuffer = getRecordClassBuffer(questionClass);
    const encodedDomainNameBuffer = Buffer.from(
      this.encodeDomainName(domainName),
      "binary"
    );

    return Buffer.concat([
      new Uint8Array(encodedDomainNameBuffer),
      new Uint8Array(questionTypeBuffer),
      new Uint8Array(questionClassBuffer),
    ]);
  }

  encodeDomainName(domainName: string): string {
    return (
      domainName
        .split(".")
        .filter((label) => label.trim() !== "")
        .map((label) => `${String.fromCharCode(label.length)}${label}`)
        .join("") + "\0"
    );
  }

  createAnswerSection(
    domainName: string,
    answerType: string,
    answerClass: number,
    timeToLive: number,
    rData: string
  ): Buffer {
    const encodedDomainNameBuffer: Buffer = Buffer.from(
      this.encodeDomainName(domainName)
    );
    const answerTypeBuffer = getRecordTypeBuffer(answerType);
    const answerClassBuffer = getRecordClassBuffer(answerClass);
    const timeToLiveBuffer = Buffer.alloc(4).writeUInt32BE(timeToLive, 0);
    const rDataLengthBuffer = Buffer.alloc(2).writeUInt16BE(rData.length, 0);
    const rDataBuffer = Buffer.from(rData, "binary");

    return Buffer.concat([
      new Uint8Array(encodedDomainNameBuffer),
      new Uint8Array(answerTypeBuffer),
      new Uint8Array(answerClassBuffer),
      new Uint8Array(timeToLiveBuffer),
      new Uint8Array(rDataLengthBuffer),
      new Uint8Array(rDataBuffer),
    ]);
  }

  parseDnsHeader(dnsHeaderBuffer: Buffer) {
    const dnsHeaderInfo: DnsHeader = {};

    const packetId = dnsHeaderBuffer.readUInt16BE(0);
    dnsHeaderInfo.packetId = packetId;

    const byte2 = dnsHeaderBuffer.readUInt8(2);

    dnsHeaderInfo.isResponse = (byte2 & 0b10000000) === 0b10000000;
    dnsHeaderInfo.operationCode = byte2 & 0b01111000;
    dnsHeaderInfo.isAuthoritativeAnswer = (byte2 & 0b00000100) === 0b00000100;
    dnsHeaderInfo.truncation = byte2 & 0b00000010;
    dnsHeaderInfo.isRecursionDesired = (0b00000001 & byte2) === 0b00000001;

    const byte3 = dnsHeaderBuffer.readUInt8(3);

    dnsHeaderInfo.isRecursionAvailable = (byte3 & 0b10000000) === 0b10000000;
    dnsHeaderInfo.reserved = byte3 & 0b01110000;
    dnsHeaderInfo.responseCode = byte3 & 0b00001111;

    dnsHeaderInfo.questionCount = dnsHeaderBuffer.readUInt16BE(4);
    dnsHeaderInfo.answerRecordCount = dnsHeaderBuffer.readUInt16BE(6);
    dnsHeaderInfo.authorityRecordCount = dnsHeaderBuffer.readUInt16BE(8);
    dnsHeaderInfo.additionalRecordCount = dnsHeaderBuffer.readUInt16BE(10);

    console.log(dnsHeaderInfo);

    return dnsHeaderInfo;
  }
}
