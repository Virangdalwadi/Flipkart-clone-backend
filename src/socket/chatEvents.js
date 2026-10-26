export const conversationRoom = (conversationId) =>
  `conversation:${conversationId}`;
export const userRoom = (userId) => `user:${userId}`;

export function broadcastConversationMessage(io, conversation, message, sender) {
  const conversationId = String(conversation._id);
  const payload = {
    ...message,
    conversation: conversationId,
    sender: {
      _id: String(sender._id),
      username: sender.username,
      profileImage: sender.profileImage,
      role: sender.role,
    },
  };

  io.to(conversationRoom(conversationId))
    .to(userRoom(conversation.customer))
    .to(userRoom(conversation.seller))
    .emit("message:new", payload);
}

export function broadcastConversationUpdate(io, conversation, lastMessage) {
  const payload = {
    conversationId: String(conversation._id),
    lastMessage,
  };
  io.to(userRoom(conversation.customer))
    .to(userRoom(conversation.seller))
    .emit("conversation:updated", payload);
}
