import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "user is Required"],
    },
    refreshTokenHash: {
      type: String,
      required: [true, "Referesh token hash is required"],
    },
    ip: {
      type: String,
      required: [true, "IP is required"],
    },
    userAgent: {
      type: String,
      required: [true, "User agent is required"],
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Session = mongoose.model("Session", sessionSchema);

export default Session;
