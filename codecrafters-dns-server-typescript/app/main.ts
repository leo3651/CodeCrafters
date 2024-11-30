import * as dgram from "dgram";
import { DnsHandler } from "./dnsHandler";

const udpSocket: dgram.Socket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");
const dnsHandler = new DnsHandler();

udpSocket.on("message", (data: Buffer, remoteAddr: dgram.RemoteInfo) => {
  try {
    console.log(`Received data from ${remoteAddr.address}:${remoteAddr.port}`);
    console.log("Received data buffer", data);

    const parsedDnsHeader = dnsHandler.parseDnsHeader(data);

    const header = dnsHandler.createDnsHeader({
      isResponse: true,
      packetId: parsedDnsHeader.packetId,
      questionCount: 1,
      answerRecordCount: 1,
      isRecursionDesired: parsedDnsHeader.isRecursionDesired,
      operationCode: parsedDnsHeader.operationCode,
      responseCode: parsedDnsHeader.operationCode === 0 ? 0 : 4,
    });
    const questionSection = dnsHandler.createQuestionSection(
      "codecrafters.io",
      "A",
      1
    );
    const answerSection = dnsHandler.createAnswerSection(
      "codecrafters.io",
      "A",
      1,
      60,
      "\x08\x08\x08\x08"
    );

    udpSocket.send(
      new Uint8Array(
        Buffer.concat([
          new Uint8Array(header),
          new Uint8Array(questionSection),
          new Uint8Array(answerSection),
        ])
      ),
      remoteAddr.port,
      remoteAddr.address
    );
  } catch (e) {
    console.log(`Error sending data: ${e}`);
  }
});
