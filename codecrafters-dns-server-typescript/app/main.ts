import * as dgram from "dgram";
import { DnsHandler } from "./dnsHandler";

const udpSocket: dgram.Socket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");
const dnsHandler = new DnsHandler();
console.log(dnsHandler.encodeDomainName("codecrafters.io."));

udpSocket.on("message", (data: Buffer, remoteAddr: dgram.RemoteInfo) => {
  try {
    console.log(`Received data from ${remoteAddr.address}:${remoteAddr.port}`);
    console.log("Received data buffer", data);

    // const firstMessHeader = dnsHandler.createDnsHeader(1234);
    const secondMessHeader = dnsHandler.createDnsHeader(
      1234,
      true,
      0,
      false,
      false,
      false,
      false,
      0,
      1
    );
    const questionSection = dnsHandler.createQuestionSection(
      "codecrafters.io",
      "A",
      1
    );

    console.log("qSection", questionSection);
    questionSection.forEach((byte) => console.log(String.fromCharCode(byte)));
    // udpSocket.send(
    //   new Uint8Array(firstMessHeader),
    //   remoteAddr.port,
    //   remoteAddr.address
    // );

    udpSocket.send(
      new Uint8Array(
        Buffer.concat([
          new Uint8Array(secondMessHeader),
          new Uint8Array(questionSection),
        ])
      ),
      remoteAddr.port,
      remoteAddr.address
    );
  } catch (e) {
    console.log(`Error sending data: ${e}`);
  }
});
