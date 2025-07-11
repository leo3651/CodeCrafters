import net from "net";
import { kafkaHandler } from "./kafkaHandler";

const server: net.Server = net.createServer((socket: net.Socket) => {
  console.log(`Client ${socket.remoteAddress}:${socket.remotePort} CONNECTED!`);

  socket.on("data", (data) => {
    console.log("RECEIVED BUFFER: ");
    console.log(data);
    console.log(`RECEIVED BUFFER TO STRING: ${data.toString()}`);

    const resBuffer = kafkaHandler.createResponse(data);

    socket.write(resBuffer);
  });
});

server.listen(9092, "127.0.0.1");
