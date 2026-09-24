import jwt from "jsonwebtoken";
import config from "../config/config.js";
import Session from "../models/session.model.js";
import User from "../models/user.model.js";

export async function protect(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
    const session = await Session.findOne({
      _id: decoded.sessionId,
      user: decoded.id,
      revoked: false,
    });

    if (!session) {
      return res.status(401).json({ message: "Session is invalid or expired" });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired access token" });
  }
}
