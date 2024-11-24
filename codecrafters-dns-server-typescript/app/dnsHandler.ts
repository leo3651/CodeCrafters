import crypto from "crypto";
import { getQuestionClassBuffer, getQuestionTypeBuffer } from "./utils";

export class DnsHandler {
  constructor() {}

  createDnsHeader(
    packetId: number = -9999,
    isResponse: boolean = true,
    operationCode: number = 0,
    isAuthoritativeAnswer: boolean = false,
    largerThan512Bytes: boolean = false,
    isRecursionDesired: boolean = false,
    isRecursionAvailable: boolean = false,
    responseCode: number = 0,
    questionCount: number = 0,
    answerRecordCount: number = 0,
    authorityRecordCount: number = 0,
    additionalRecordCount: number = 0
  ): Buffer {
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
    byte2 |= operationCode << 3;
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

    return dnsHeader;
  }

  createQuestionSection(
    domainName: string,
    questionType: string,
    questionClass: number
  ) {
    const questionTypeBuffer = getQuestionTypeBuffer(questionType);
    const questionClassBuffer = getQuestionClassBuffer(questionClass);
    const encodedDomainNameBuffer = Buffer.from(
      this.encodeDomainName(domainName) + "\0",
      "binary"
    );

    return Buffer.concat([
      new Uint8Array(encodedDomainNameBuffer),
      new Uint8Array(questionTypeBuffer),
      new Uint8Array(questionClassBuffer),
    ]);
  }

  encodeDomainName(domainName: string): string {
    return domainName
      .split(".")
      .filter((label) => label.trim() !== "")
      .map((label) => `${String.fromCharCode(label.length)}${label}`)
      .join("");
  }
}
