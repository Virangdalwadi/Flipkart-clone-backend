import mongoose from "mongoose";
import Session from "../../models/session.model.js";
import User from "../../models/user.model.js";

const SAFE_USER_FIELDS =
  "username lastName email role isActive mobile gender createdAt updatedAt";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseUserId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value)
    ? value
    : null;
}

function serializeUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    lastName: user.lastName || "",
    email: user.email,
    role: user.role,
    isActive: user.isActive !== false,
    mobile: user.mobile || "",
    gender: user.gender || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function getUsers(req, res, next) {
  const page = parsePositiveInteger(req.query.page, 1);
  const requestedLimit = parsePositiveInteger(req.query.limit, 20);
  if (page === null || requestedLimit === null) {
    return res.status(400).json({
      message: "Page and limit must be positive integers",
    });
  }

  const { search, role, status } = req.query;
  if (
    (search !== undefined && typeof search !== "string") ||
    (role !== undefined && !["admin", "user"].includes(role)) ||
    (status !== undefined && !["active", "inactive"].includes(status))
  ) {
    return res.status(400).json({ message: "Invalid user list filters" });
  }
  if (typeof search === "string" && search.length > 100) {
    return res.status(400).json({ message: "Search must not exceed 100 characters" });
  }

  const limit = Math.min(100, requestedLimit);
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) {
    return res.status(400).json({ message: "Page is too large" });
  }

  const clauses = [];
  if (typeof search === "string" && search.trim()) {
    const searchRegex = {
      $regex: escapeRegex(search.trim()),
      $options: "i",
    };
    clauses.push({
      $or: [
        { username: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
      ],
    });
  }
  if (role) clauses.push({ role });
  if (status === "active") {
    clauses.push({
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    });
  } else if (status === "inactive") {
    clauses.push({ isActive: false });
  }

  const filter = clauses.length ? { $and: clauses } : {};

  try {
    const [users, total] = await Promise.all([
      User.find(filter)
        .select(SAFE_USER_FIELDS)
        .sort({ createdAt: -1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users: users.map(serializeUser),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getUserById(req, res, next) {
  const id = parseUserId(req.params.id);
  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await User.findById(id).select(SAFE_USER_FIELDS).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ user: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
}

export async function updateUserStatus(req, res, next) {
  const id = parseUserId(req.params.id);
  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  if (
    !req.body ||
    typeof req.body.isActive !== "boolean" ||
    Object.keys(req.body).length !== 1
  ) {
    return res.status(400).json({
      message: "Request body must contain only a boolean isActive field",
    });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot change your own account status" });
    }
    if (user.role === "admin") {
      return res.status(403).json({ message: "Administrator accounts are protected" });
    }

    const isActive = req.body.isActive;
    if (user.isActive !== isActive) {
      user.isActive = isActive;
      await user.save();
    }
    if (!isActive) {
      await Session.updateMany(
        { user: user._id, revoked: false },
        { $set: { revoked: true } },
      );
    }

    return res.status(200).json({
      message: isActive ? "User account activated" : "User account deactivated",
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}