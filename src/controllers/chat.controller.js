import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import Product from "../models/product.model.js";
import {
  broadcastConversationMessage,
  broadcastConversationUpdate,
} from "../socket/chatEvents.js";

const participantRoles = new Set(["seller", "user"]);

function validMessageText(text) {
  return typeof text === "string" && text.trim().length > 0 && text.trim().length <= 2000;
}

function validConversationId(id) {
  return mongoose.isValidObjectId(id);
}

function participantFilter(userId) {
  return { $or: [{ customer: userId }, { seller: userId }] };
}

export async function getConversations(req, res, next) {
  if (!participantRoles.has(req.user.role)) {
    return res.status(403).json({ message: "Messaging is not available for this account" });
  }

  try {
    const field = req.user.role === "seller" ? "seller" : "customer";
    const conversations = await Conversation.find({ [field]: req.user._id })
      .sort({ updatedAt: -1 })
      .populate("product", "id title thumbnail")
      .populate("customer", "username profileImage")
      .populate("seller", "username profileImage")
      .lean();

    return res.status(200).json({ conversations });
  } catch (error) {
    return next(error);
  }
}

export async function startConversation(req, res, next) {
  if (req.user.role !== "user") {
    return res.status(403).json({ message: "Only customers can start a conversation" });
  }

  const productId = Number(req.body?.productId);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !validMessageText(req.body?.text)) {
    return res.status(400).json({ message: "A valid product and message are required" });
  }

  try {
    const product = await Product.findOne({ id: productId, isActive: true }).populate(
      "seller",
      "role",
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.seller?.role !== "seller") {
      return res.status(409).json({ message: "This product is not assigned to a seller account" });
    }

    const conversation = await Conversation.findOneAndUpdate(
      {
        customer: req.user._id,
        seller: product.seller._id,
        product: product._id,
      },
      {
        $setOnInsert: {
          customer: req.user._id,
          seller: product.seller._id,
          product: product._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: req.body.text.trim(),
    });
    conversation.lastMessage = message.text;
    await conversation.save();

    const io = req.app.get("io");
    if (io) {
      broadcastConversationMessage(
        io,
        conversation,
        message.toObject(),
        req.user,
      );
      broadcastConversationUpdate(io, conversation, message.text);
    }

    return res.status(201).json({ conversation, message });
  } catch (error) {
    return next(error);
  }
}

export async function getConversationMessages(req, res, next) {
  if (!validConversationId(req.params.conversationId)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      ...participantFilter(req.user._id),
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("sender", "username profileImage role")
      .lean();

    return res.status(200).json({ messages: messages.reverse() });
  } catch (error) {
    return next(error);
  }
}

export async function sendConversationMessage(req, res, next) {
  if (!validConversationId(req.params.conversationId)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }
  if (!participantRoles.has(req.user.role) || !validMessageText(req.body?.text)) {
    return res.status(400).json({ message: "A valid message is required" });
  }

  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      ...participantFilter(req.user._id),
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: req.body.text.trim(),
    });
    conversation.lastMessage = message.text;
    await conversation.save();

    const io = req.app.get("io");
    if (io) {
      broadcastConversationMessage(
        io,
        conversation,
        message.toObject(),
        req.user,
      );
    }

    return res.status(201).json({ message });
  } catch (error) {
    return next(error);
  }
}
