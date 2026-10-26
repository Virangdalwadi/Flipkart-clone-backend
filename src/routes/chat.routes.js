import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getConversationMessages,
  getConversations,
  sendConversationMessage,
  startConversation,
} from "../controllers/chat.controller.js";

const chatRoutes = Router();

chatRoutes.use(protect);
chatRoutes.get("/conversations", getConversations);
chatRoutes.post("/conversations", startConversation);
chatRoutes.get("/conversations/:conversationId/messages", getConversationMessages);
chatRoutes.post("/conversations/:conversationId/messages", sendConversationMessage);

export default chatRoutes;
