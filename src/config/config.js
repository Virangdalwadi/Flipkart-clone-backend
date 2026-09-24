import dotenv from "dotenv";

dotenv.config();

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is not defined in enviorment variables");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defind in enviorment variables");
}

const config = {
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
};

export default config;
