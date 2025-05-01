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
