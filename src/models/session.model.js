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
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
      index: { expires: 0 }, // Tells MongoDB to delete the document exactly when expiresAt is reached
    },
  },
  {
    timestamps: true,
  },
);

const Session = mongoose.model("Session", sessionSchema);

export default Session;
