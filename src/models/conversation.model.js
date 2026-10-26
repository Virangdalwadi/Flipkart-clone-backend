import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    lastMessage: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

conversationSchema.index(
  { customer: 1, seller: 1, product: 1 },
  { unique: true },
);

export default mongoose.model("Conversation", conversationSchema);
