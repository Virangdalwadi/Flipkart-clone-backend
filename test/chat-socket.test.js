import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, afterEach, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { io as createClient } from "socket.io-client";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/flipkart-chat-tests";
process.env.JWT_SECRET ||= "test-only-jwt-secret";

const [
  { default: app },
  { default: Conversation },
  { default: Message },
  { default: Session },
  { default: User },
  { initializeChatSocket },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/conversation.model.js"),
  import("../src/models/message.model.js"),
  import("../src/models/session.model.js"),
  import("../src/models/user.model.js"),
  import("../src/socket/chatSocket.js"),
]);

const customerId = "507f1f77bcf86cd799439011";
const sellerId = "507f1f77bcf86cd799439012";
const unrelatedUserId = "507f1f77bcf86cd799439013";
const adminId = "507f1f77bcf86cd799439016";
const conversationId = "507f1f77bcf86cd799439014";
const sessionId = "507f1f77bcf86cd799439015";
const users = new Map();
const savedMessages = [];
const updatedConversations = [];
const originalMethods = {
  conversationFindOne: Conversation.findOne,
  conversationUpdateOne: Conversation.updateOne,
  messageCreate: Message.create,
  messageFindOne: Message.findOne,
  sessionFindOne: Session.findOne,
  userFindById: User.findById,
};
let server;
let ioServer;
let baseUrl;
const clients = new Set();

function createUser(id, role) {
  return {
    _id: id,
    role,
    username: role === "user" ? "Customer" : "Seller",
    profileImage: "",
    isActive: true,
  };
}

function tokenFor(userId) {
  return jwt.sign(
    { id: userId, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

function createMessage(data) {
  const senderId = String(data.sender);
  const message = {
    ...data,
    _id: `message-${savedMessages.length + 1}`,
    sender: senderId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    async populate() {
      this.sender = users.get(senderId);
      return this;
    },
    toObject() {
      return {
        _id: this._id,
        conversation: this.conversation,
        sender: this.sender,
        text: this.text,
        clientMessageId: this.clientMessageId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    },
  };
  Object.defineProperty(message, "senderId", { value: senderId });
  return message;
}

function makeSocket(userId) {
  const socket = createClient(baseUrl, {
    auth: { token: tokenFor(userId) },
    transports: ["websocket"],
    reconnection: false,
  });
  clients.add(socket);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connection timed out")), 3000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emitWithAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(3000).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

before(async () => {
  server = createServer(app);
  ioServer = initializeChatSocket(server, app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  users.clear();
  users.set(customerId, createUser(customerId, "user"));
  users.set(sellerId, createUser(sellerId, "seller"));
  users.set(unrelatedUserId, createUser(unrelatedUserId, "user"));
  users.set(adminId, createUser(adminId, "admin"));
  savedMessages.length = 0;
  updatedConversations.length = 0;

  Session.findOne = async (filter) =>
    filter._id === sessionId && filter.revoked === false ? { _id: sessionId } : null;
  User.findById = async (id) => users.get(String(id)) || null;
  Conversation.findOne = (filter) => {
    const permitted = filter._id === conversationId &&
      filter.$or?.some((participant) =>
        [customerId, sellerId].includes(String(Object.values(participant)[0])),
      );
    const conversation = permitted
      ? { _id: conversationId, customer: customerId, seller: sellerId }
      : null;
    return {
      select: async () => (conversation ? { _id: conversation._id } : null),
      then(resolve, reject) {
        return Promise.resolve(conversation).then(resolve, reject);
      },
    };
  };
  Conversation.updateOne = async (filter, update) => {
    updatedConversations.push({ filter, update });
  };
  Message.create = async (data) => {
    const duplicate = savedMessages.find(
      (message) =>
        message.conversation === data.conversation &&
        message.senderId === data.sender &&
        message.clientMessageId === data.clientMessageId,
    );
    if (duplicate) {
      const error = new Error("Duplicate client message ID");
      error.code = 11000;
      throw error;
    }
    const message = createMessage(data);
    savedMessages.push(message);
    return message;
  };
  Message.findOne = async (filter) =>
    savedMessages.find(
      (message) =>
        message.conversation === filter.conversation &&
        message.senderId === filter.sender &&
        message.clientMessageId === filter.clientMessageId,
    ) || null;
});

afterEach(() => {
  for (const socket of clients) socket.disconnect();
  clients.clear();
  Conversation.findOne = originalMethods.conversationFindOne;
  Conversation.updateOne = originalMethods.conversationUpdateOne;
  Message.create = originalMethods.messageCreate;
  Message.findOne = originalMethods.messageFindOne;
  Session.findOne = originalMethods.sessionFindOne;
  User.findById = originalMethods.userFindById;
});

after(async () => {
  await new Promise((resolve) => ioServer.close(resolve));
});

test("authenticates customer and seller from their access-token sessions", async () => {
  const customer = await makeSocket(customerId);
  const seller = await makeSocket(sellerId);

  assert.equal(customer.connected, true);
  assert.equal(seller.connected, true);
});

test("rejects unauthenticated socket connections", async () => {
  const socket = createClient(baseUrl, {
    transports: ["websocket"],
    reconnection: false,
  });
  clients.add(socket);
  await assert.rejects(
    new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    }),
    /Authentication required/,
  );
});

test("rejects revoked sessions and accounts outside messaging roles", async () => {
  Session.findOne = async () => null;
  const revokedSessionSocket = createClient(baseUrl, {
    auth: { token: tokenFor(customerId) },
    transports: ["websocket"],
    reconnection: false,
  });
  clients.add(revokedSessionSocket);
  await assert.rejects(
    new Promise((resolve, reject) => {
      revokedSessionSocket.once("connect", resolve);
      revokedSessionSocket.once("connect_error", reject);
    }),
    /Invalid or expired access token/,
  );

  Session.findOne = async () => ({ _id: sessionId });
  const adminSocket = createClient(baseUrl, {
    auth: { token: tokenFor(adminId) },
    transports: ["websocket"],
    reconnection: false,
  });
  clients.add(adminSocket);
  await assert.rejects(
    new Promise((resolve, reject) => {
      adminSocket.once("connect", resolve);
      adminSocket.once("connect_error", reject);
    }),
    /Messaging is not available/,
  );
});

test("only conversation participants can join and receive persisted messages", async () => {
  const customer = await makeSocket(customerId);
  const seller = await makeSocket(sellerId);
  const unrelatedUser = await makeSocket(unrelatedUserId);

  assert.deepEqual(
    await emitWithAck(customer, "conversation:join", { conversationId }),
    { ok: true },
  );
  assert.deepEqual(
    await emitWithAck(seller, "conversation:join", { conversationId }),
    { ok: true },
  );
  assert.equal(
    (
      await emitWithAck(unrelatedUser, "conversation:join", {
        conversationId,
      })
    ).ok,
    false,
  );

  const customerDelivery = new Promise((resolve) =>
    customer.once("message:new", resolve),
  );
  const sellerDelivery = new Promise((resolve) =>
    seller.once("message:new", resolve),
  );
  let unrelatedUserReceivedMessage = false;
  unrelatedUser.once("message:new", () => {
    unrelatedUserReceivedMessage = true;
  });
  const messagePayload = {
    conversationId,
    text: "Hello seller",
    clientMessageId: "client-message-1",
  };
  const [acknowledgement, customerMessage, sellerMessage] = await Promise.all([
    emitWithAck(customer, "message:send", messagePayload),
    customerDelivery,
    sellerDelivery,
  ]);

  assert.equal(acknowledgement.ok, true);
  assert.equal(savedMessages.length, 1);
  assert.equal(savedMessages[0].text, messagePayload.text);
  assert.equal(updatedConversations.length, 1);
  assert.equal(customerMessage._id, sellerMessage._id);
  assert.equal(sellerMessage.text, messagePayload.text);
  assert.equal(sellerMessage.sender.role, "user");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(unrelatedUserReceivedMessage, false);

  const retry = await emitWithAck(customer, "message:send", messagePayload);
  assert.equal(retry.ok, true);
  assert.equal(savedMessages.length, 1);
});
