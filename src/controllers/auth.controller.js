import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/config.js";
import cloudinary from "../config/cloudinary.js";
import Session from "../models/session.model.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const commonPasswords = new Set([
  "password",
  "password123",
  "12345678",
  "qwerty",
  "qwerty123",
  "abc123",
  "letmein",
  "welcome",
  "admin123",
  "iloveyou",
  "changeme",
]);

// Password Validation
const getPasswordValidationError = (password, username, email) => {
  if (password.length < 8) return "Password must be at least 8 characters long";
  if (password.length > 128) return "Password must not exceed 128 characters";
  if (/\s/.test(password)) return "Password must not contain spaces";
  if (!/[A-Z]/.test(password))
    return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password))
    return "Password must contain a lowercase letter";
  if (!/\d/.test(password)) return "Password must contain a number";
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Password must contain a special character";
  }
  if (/(.)\1\1/.test(password)) {
    return "Password must not contain three repeated characters";
  }

  const normalizedPassword = password.toLowerCase();
  const predictablePatterns = [
    "012",
    "123",
    "234",
    "345",
    "456",
    "567",
    "678",
    "789",
    "987",
    "qwerty",
    "asdf",
  ];

  if (commonPasswords.has(normalizedPassword)) {
    return "This password is too common. Please choose a stronger password";
  }
  // if (
  //   predictablePatterns.some((pattern) => normalizedPassword.includes(pattern))
  // ) {
  //   return "Password must not contain predictable sequences";
  // }
  // if (username && normalizedPassword.includes(username.toLowerCase())) {
  //   return "Password must not contain your name";
  // }
  // if (email && normalizedPassword.includes(email.toLowerCase())) {
  //   return "Password must not contain your email";
  // }

  return null;
};

// Register
export async function register(req, res) {
  try {
    const username = req.body.username?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      });
    }

    const passwordError = getPasswordValidationError(password, username, email);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const isAlreadyRegister = await User.findOne({
      $or: [{ email }],
    });

    if (isAlreadyRegister) {
      return res.status(409).json({
        message: "Email or Username already exists",
      });
    }

    // bcrypt handles salting internally — no need to generate/store a salt separately
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "user",
    });

    const refreshtoken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
      expiresIn: "7d",
    });

    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshtoken)
      .digest("hex");

    const session = await Session.create({
      user: user._id,
      refreshTokenHash,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const accesstoken = jwt.sign(
      {
        id: user._id,
        sessionId: session._id,
      },
      config.JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.cookie("refreshtoken", refreshtoken, refreshCookieOptions);

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        username: user.username,
        lastName: user.lastName,
        gender: user.gender,
        mobile: user.mobile,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
      },
      accesstoken,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message:
          Object.values(error.errors)[0]?.message ||
          "Invalid registration data",
      });
    }

    return res.status(500).json({
      message: "Internal server error during registration",
    });
  }
}

// Login
export async function login(req, res) {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;

    // 1. Verify inputs exist
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // 2. Locate user via email — must explicitly re-include password
    //    since the schema sets select: false on it
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 3. Compare the incoming password against the stored bcrypt hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    // 4. Generate a new refresh token
    const refreshtoken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
      expiresIn: "7d",
    });

    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshtoken)
      .digest("hex");

    // 5. Track device session details in the database
    const session = await Session.create({
      user: user._id,
      refreshTokenHash,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // 6. Generate the short-lived access token containing the dynamic sessionId
    const accesstoken = jwt.sign(
      {
        id: user._id,
        sessionId: session._id,
      },
      config.JWT_SECRET,
      { expiresIn: "15m" },
    );

    // 7. Store refresh token cookie securely
    res.cookie("refreshtoken", refreshtoken, refreshCookieOptions);

    return res.status(200).json({
      message: "Login successful",
      user: {
        username: user.username,
        lastName: user.lastName,
        gender: user.gender,
        mobile: user.mobile,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
      },
      accesstoken,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error during login",
    });
  }
}

// Get me
export async function getme(req, res) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        message: "Token not Provided",
      });
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.isActive === false) {
      return res.status(401).json({ message: "Account is unavailable" });
    }

    return res.status(200).json({
      message: "User Fetched Successfully",
      user: {
        username: user.username,
        lastName: user.lastName,
        gender: user.gender,
        mobile: user.mobile,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired access token",
    });
  }
}

// Update Profile
export async function updateProfile(req, res) {
  const { username, lastName, gender, mobile } = req.body;
  const updates = {};

  if (username !== undefined) {
    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ message: "First name is required" });
    }
    updates.username = username.trim();
  }

  if (lastName !== undefined) {
    if (typeof lastName !== "string") {
      return res.status(400).json({ message: "Last name must be text" });
    }
    updates.lastName = lastName.trim();
  }

  if (gender !== undefined) {
    if (!["male", "female"].includes(gender)) {
      return res.status(400).json({ message: "Select a valid gender" });
    }
    updates.gender = gender;
  }

  if (mobile !== undefined) {
    if (typeof mobile !== "string" || !/^[6-9]\d{9}$/.test(mobile.trim())) {
      return res.status(400).json({
        message: "Enter a valid 10-digit Indian mobile number",
      });
    }
    updates.mobile = mobile.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No profile information provided" });
  }

  try {
    Object.assign(req.user, updates);
    await req.user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user: {
        username: req.user.username,
        lastName: req.user.lastName,
        gender: req.user.gender,
        mobile: req.user.mobile,
        email: req.user.email,
        role: req.user.role,
        profileImage: req.user.profileImage,
      },
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message:
          Object.values(error.errors)[0]?.message || "Invalid profile data",
      });
    }
    return res.status(500).json({ message: "Unable to update profile" });
  }
}

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getProfileImageFormat(buffer, mimeType) {
  if (
    mimeType === "image/jpeg" &&
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  ) {
    return "jpg";
  }
  if (
    mimeType === "image/png" &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    mimeType === "image/webp" &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function uploadProfileImage(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (!result?.secure_url || !result.public_id) {
          reject(new Error("Cloudinary returned an incomplete image upload"));
        } else {
          resolve(result);
        }
      },
    );
    upload.end(buffer);
  });
}

function isOwnedProfileImage(user, publicId) {
  if (!publicId || typeof publicId !== "string") return false;
  const folder = `profile-images/${user._id}`;
  return publicId.startsWith(`${folder}/`) && !publicId.includes("..");
}

async function deleteOwnedProfileImage(user, publicId) {
  if (!isOwnedProfileImage(user, publicId)) return false;
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
  return result?.result === "ok" || result?.result === "not found";
}

export async function updateProfileImage(req, res) {
  const mimeType = req.headers["content-type"]
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (!PROFILE_IMAGE_MIME_TYPES.has(mimeType)) {
    return res.status(415).json({
      message: "Upload a JPG, JPEG, PNG, or WebP image",
    });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: "An image file is required" });
  }
  if (req.body.length > PROFILE_IMAGE_MAX_BYTES) {
    return res.status(413).json({ message: "Image must be 5 MB or smaller" });
  }

  if (!getProfileImageFormat(req.body, mimeType)) {
    return res
      .status(400)
      .json({ message: "The image file is invalid or unsupported" });
  }

  const folder = `profile-images/${req.user._id}`;
  const publicId = `${folder}/${crypto.randomUUID()}`;
  let uploaded;
  try {
    uploaded = await uploadProfileImage(req.body, publicId);
  } catch (error) {
    console.error("Cloudinary profile image upload failed:", error);
    return res.status(502).json({ message: "Unable to upload profile image" });
  }

  const oldPublicId = req.user.profileImagePublicId;
  req.user.profileImage = uploaded.secure_url;
  req.user.profileImagePublicId = uploaded.public_id;
  try {
    await req.user.save();
  } catch (error) {
    try {
      const deleted = await deleteOwnedProfileImage(
        req.user,
        uploaded.public_id,
      );
      if (!deleted) {
        console.error("Cloudinary did not remove the unsaved profile image");
      }
    } catch (cleanupError) {
      console.error(
        "Unable to clean up an unsaved profile image:",
        cleanupError,
      );
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message:
          Object.values(error.errors)[0]?.message || "Invalid profile image",
      });
    }
    console.error("Unable to save profile image:", error);
    return res.status(500).json({ message: "Unable to save profile image" });
  }

  let warning;
  try {
    if (oldPublicId && oldPublicId !== uploaded.public_id) {
      const deleted = await deleteOwnedProfileImage(req.user, oldPublicId);
      if (!deleted) warning = "The previous profile image could not be removed";
    }
  } catch (error) {
    console.error("Unable to remove the previous profile image:", error);
    warning = "The previous profile image could not be removed";
  }

  return res.status(200).json({
    message: "Profile image updated successfully",
    user: {
      profileImage: req.user.profileImage,
    },
    ...(warning ? { warning } : {}),
  });
}

export async function removeProfileImage(req, res) {
  const oldPublicId = req.user.profileImagePublicId;
  req.user.profileImage = "";
  req.user.profileImagePublicId = "";

  try {
    await req.user.save();
  } catch (error) {
    console.error("Unable to remove profile image:", error);
    return res.status(500).json({ message: "Unable to remove profile image" });
  }

  let warning;
  try {
    if (oldPublicId) {
      const deleted = await deleteOwnedProfileImage(req.user, oldPublicId);
      if (!deleted)
        warning =
          "The profile image was removed, but its stored file could not be deleted";
    }
  } catch (error) {
    console.error(
      "Unable to delete removed profile image from Cloudinary:",
      error,
    );
    warning =
      "The profile image was removed, but its stored file could not be deleted";
  }

  return res.status(200).json({
    message: "Profile image removed successfully",
    user: { profileImage: "" },
    ...(warning ? { warning } : {}),
  });
}

// Referesh Token
export async function refreshtoken(req, res) {
  try {
    const refreshtoken = req.cookies.refreshtoken;

    if (!refreshtoken) {
      return res.status(401).json({
        message: "Refresh Token not found",
      });
    }

    const decoded = jwt.verify(refreshtoken, config.JWT_SECRET);

    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshtoken)
      .digest("hex");

    const session = await Session.findOne({
      refreshTokenHash,
      revoked: false,
    });

    if (!session) {
      res.clearCookie("refreshtoken", refreshCookieOptions);
      return res.status(401).json({
        message: "Invalid refresh Token",
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.isActive === false) {
      session.revoked = true;
      await session.save();
      res.clearCookie("refreshtoken", refreshCookieOptions);
      return res.status(401).json({ message: "Account is deactivated" });
    }

    const accesstoken = jwt.sign(
      {
        id: decoded.id,
        sessionId: session._id,
      },
      config.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const newrefreshtoken = jwt.sign({ id: decoded.id }, config.JWT_SECRET, {
      expiresIn: "7d",
    });

    const newrefreshtokenHash = crypto
      .createHash("sha256")
      .update(newrefreshtoken)
      .digest("hex");

    session.refreshTokenHash = newrefreshtokenHash;
    await session.save();

    res.cookie("refreshtoken", newrefreshtoken, refreshCookieOptions);

    return res.status(200).json({
      message: "Access token refreshed Successfully",
      accesstoken,
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
}

// Logout
export async function logout(req, res) {
  try {
    const refreshtoken = req.cookies.refreshtoken;

    if (!refreshtoken) {
      return res.status(400).json({
        message: "Refresh token not found",
      });
    }

    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshtoken)
      .digest("hex");

    const session = await Session.findOne({
      refreshTokenHash,
      revoked: false,
    });

    if (!session) {
      return res.status(400).json({
        message: "Invalid Refresh token",
      });
    }

    session.revoked = true;
    await session.save();

    res.clearCookie("refreshtoken", refreshCookieOptions);

    return res.status(200).json({
      message: "Logout Successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error during logout",
    });
  }
}
