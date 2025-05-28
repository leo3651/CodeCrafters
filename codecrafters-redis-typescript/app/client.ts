import * as net from "net";

console.log(Buffer.from("123").toString());
// Create a TCP client
const client: net.Socket = net.createConnection(
  { host: "127.0.0.1", port: 6379 },
  () => {
    console.log("Connected to server");
    // Send something
    client.write("Hello from client!");
  }
);

// Listen for server responses
client.on("data", (data) => {
  console.log("Received from server:", data.toString());
});

// Handle disconnection
client.on("end", () => {
  console.log("Disconnected from server");
});

("+FULLRESYNC 75cd7bc10c49047e0d163660f3b90625b1af31dc 0\r\n$88\r\nREDIS0011ú   redis-ver\u00057.2.0ú\nredis-bitsÀ@ú\u0005ctimeÂ¼eused-memÂ°Ä\u0010aof-baseÀÿðn;þÀÿZ¢*3\r\n$8\r\nREPLCONF\r\n$6\r\nGETACK\r\n$1\r\n*\r\n");
