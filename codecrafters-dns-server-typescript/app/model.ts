export interface DnsHeader {
  packetId?: number;
  isResponse?: boolean;
  operationCode?: number;
  isAuthoritativeAnswer?: boolean;
  largerThan512Bytes?: boolean;
  isRecursionDesired?: boolean;
  isRecursionAvailable?: boolean;
  responseCode?: number;
  questionCount?: number;
  answerRecordCount?: number;
  authorityRecordCount?: number;
  additionalRecordCount?: number;
  truncation?: number;
  reserved?: number;
}

export interface ParsedQuestion {
  domainName: string;
  questionType: Buffer;
  questionClass: Buffer;
}

export interface ParsedAnswer {
  domainName: string;
  answerType: Buffer;
  answerClass: Buffer;
  timeToLive: number;
  data: string;
}
