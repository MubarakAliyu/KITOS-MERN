/**
 * Two real sockets, as two people, against the running API.
 *
 * The unit tests cover the handshake. This checks the thing they cannot: that
 * a message sent by one person actually arrives at the other's socket, which
 * is what "chat in real time" means and what AC3.2 asks for.
 */
import { io } from "socket.io-client";

const API = "http://localhost:4000";

async function login(identifier, password) {
  const r = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: identifier, password }),
  });
  const body = await r.json();
  if (!body.access) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.access;
}

function connect(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    socket.on("connect", () => {
      console.log(`${label}: connected`);
      resolve(socket);
    });
    socket.on("connect_error", (err) => reject(new Error(`${label}: ${err.message}`)));
  });
}

const studentToken = await login("KIT/26/001", "KIT@learn2025");
const instructorToken = await login("instructor@kidsintech.school", "KIT@teach2025");

const conversations = await fetch(`${API}/conversations`, {
  headers: { Authorization: `Bearer ${studentToken}` },
}).then((r) => r.json());
const conversationId = conversations[0].id;
console.log(`thread: ${conversations[0].participant_name} (${conversationId})`);

const studentSocket = await connect(studentToken, "pupil");
const instructorSocket = await connect(instructorToken, "instructor");

// Both join the thread, as the chat screen does when it opens one.
studentSocket.emit("join", { conversation_id: conversationId });
instructorSocket.emit("join", { conversation_id: conversationId });
await new Promise((r) => setTimeout(r, 400));

const arrived = new Promise((resolve, reject) => {
  instructorSocket.on("message", resolve);
  setTimeout(() => reject(new Error("no message arrived within 8s")), 8000);
});

const typed = new Promise((resolve) => {
  instructorSocket.on("typing", resolve);
  setTimeout(() => resolve(null), 5000);
});

studentSocket.emit("typing", { userId: "pupil", conversationId });

// Sent the way the UI sends it: persisted over REST, then relayed.
const saved = await fetch(`${API}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${studentToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    conversation_id: conversationId,
    message: "Sent down the socket",
  }),
}).then((r) => r.json());

const received = await arrived;
console.log(`instructor received: "${received.message}"`);
console.log(`same message: ${received.id === saved.id}`);
console.log(`typing relayed: ${(await typed) !== null}`);

// And the message was stored exactly once, not twice.
const thread = await fetch(`${API}/messages?conversation_id=${conversationId}`, {
  headers: { Authorization: `Bearer ${instructorToken}` },
}).then((r) => r.json());
const copies = thread.filter((m) => m.message === "Sent down the socket").length;
console.log(`stored copies: ${copies}`);

studentSocket.disconnect();
instructorSocket.disconnect();
process.exit(copies === 1 && received.id === saved.id ? 0 : 1);
