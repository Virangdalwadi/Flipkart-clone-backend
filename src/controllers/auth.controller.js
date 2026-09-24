import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/config.js";
import Session from "../models/session.model.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
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
        email: user.email,
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
/**
 * LOGIN API ENDPOINT
 * Inputs: email, password
 */
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
        email: user.email,
      },
      accesstoken,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error during login",
    });
  }
}

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

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "User Fetched Successfully",
      user: {
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired access token",
    });
  }
}

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
      return res.status(401).json({
        message: "Invalid refresh Token",
      });
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
