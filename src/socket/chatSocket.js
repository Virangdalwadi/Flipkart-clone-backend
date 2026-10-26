import mongoose from "mongoose";
import { Server } from "socket.io";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { authenticateAccessToken } from "../middleware/authMiddleware.js";
import {
  broadcastConversationMessage,
  conversationRoom,
  userRoom,
} from "./chatEvents.js";

const participantRoles = new Set(["seller", "user"]);
const maxMessageLength = 2000;

function validMessageText(text) {
  return (
    typeof text === "string" &&
    text.trim().length > 0 &&
    text.trim().length <= maxMessageLength
  );
}

function validClientMessageId(id) {
  return typeof id === "string" && /^[\w-]{1,100}$/.test(id);
}

function participantFilter(userId) {
  return { $or: [{ customer: userId }, { seller: userId }] };
}

function reply(acknowledge, result) {
  if (typeof acknowledge === "function") acknowledge(result);
}

export function registerChatSocketHandlers(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length > 4096) {
      return next(new Error("Authentication required"));
    }

    try {
      const user = await authenticateAccessToken(token);
      if (!participantRoles.has(user.role)) {
        return next(new Error("Messaging is not available for this account"));
      }

      socket.data.user = {
        id: String(user._id),
        role: user.role,
        username: user.username,
        profileImage: user.profileImage,
      };
      return next();
    } catch (error) {
      const expectedAuthFailure =
        ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
          error.name,
        ) ||
        [
          "Invalid access token",
          "Session is invalid or expired",
          "User is unavailable",
        ].includes(error.message);
      if (!expectedAuthFailure) {
        console.error("Unable to authenticate socket connection:", error);
      }
      return next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.user.id));
    socket.data.joinedConversations = new Set();

    socket.on("conversation:join", async (payload, acknowledge) => {
      const conversationId = payload?.conversationId;
      if (
        typeof conversationId !== "string" ||
        !mongoose.isValidObjectId(conversationId)
      ) {
        return reply(acknowledge, {
          ok: false,
          error: "A valid conversation ID is required",
        });
      }

      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          ...participantFilter(socket.data.user.id),
        }).select("_id");
        if (!conversation) {
          return reply(acknowledge, {
            ok: false,
            error: "Conversation not found",
          });
        }

        for (const joinedId of socket.data.joinedConversations) {
          await socket.leave(conversationRoom(joinedId));
        }
        socket.data.joinedConversations.clear();
        await socket.join(conversationRoom(conversationId));
        socket.data.joinedConversations.add(conversationId);
        return reply(acknowledge, { ok: true });
      } catch (error) {
        console.error("Unable to authorize conversation room:", error);
        return reply(acknowledge, {
          ok: false,
          error: "Unable to join this conversation",
        });
      }
    });

    socket.on("conversation:leave", (payload) => {
      const conversationId = payload?.conversationId;
      if (socket.data.joinedConversations.has(conversationId)) {
        socket.leave(conversationRoom(conversationId));
        socket.data.joinedConversations.delete(conversationId);
      }
    });

    socket.on("message:send", async (payload, acknowledge) => {
      const conversationId = payload?.conversationId;
      const text = payload?.text;
      const clientMessageId = payload?.clientMessageId;
      const fail = (error) => {
        socket.emit("message:error", { conversationId, error });
        reply(acknowledge, { ok: false, error });
      };

      if (
        typeof conversationId !== "string" ||
        !mongoose.isValidObjectId(conversationId)
      ) {
        return fail("A valid conversation ID is required");
      }
      if (!validMessageText(text)) {
        return fail("Message must contain 1 to 2000 characters");
      }
      if (!validClientMessageId(clientMessageId)) {
        return fail("A valid client message ID is required");
      }
      if (!socket.data.joinedConversations.has(conversationId)) {
        return fail("Join this conversation before sending a message");
      }

      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          ...participantFilter(socket.data.user.id),
        });
        if (!conversation) {
          return fail("Conversation not found");
        }

        let message;
        try {
          message = await Message.create({
            conversation: conversationId,
            sender: socket.data.user.id,
            text: text.trim(),
            clientMessageId,
          });
        } catch (error) {
          if (error.code !== 11000) throw error;
          message = await Message.findOne({
            conversation: conversationId,
            sender: socket.data.user.id,
            clientMessageId,
          });
          if (!message || message.text !== text.trim()) {
            return fail("This message could not be safely retried");
          }
        }

        await Conversation.updateOne(
          { _id: conversationId },
          { $set: { lastMessage: message.text } },
        );
        const persistedMessage = message.toObject();
        const sender = {
          _id: socket.data.user.id,
          username: socket.data.user.username,
          profileImage: socket.data.user.profileImage,
          role: socket.data.user.role,
        };
        broadcastConversationMessage(io, conversation, persistedMessage, sender);
        return reply(acknowledge, {
          ok: true,
          message: {
            ...persistedMessage,
            conversation: conversationId,
            sender,
          },
        });
      } catch (error) {
        console.error("Unable to persist chat message:", error);
        return fail("Message could not be saved. Please try again.");
      }
    });
  });
}

export function initializeChatSocket(httpServer, app) {
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : [];
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });
  registerChatSocketHandlers(io);
  app?.set("io", io);
  return io;
}
