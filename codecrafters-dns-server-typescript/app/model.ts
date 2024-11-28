export interface DnsHeader {
  packetId: number;
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
}
