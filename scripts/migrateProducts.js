import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";

import cloudinary from "../src/config/cloudinary.js";

const data = JSON.parse(fs.readFileSync("../Data.json", "utf-8"));
console.log(data);

const migrateProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    const products = data.products.slice(0, 1);

    for (const product of products) {
      console.log(`Processing: ${product.id} - ${product.title}`);

      const imageUrl = product.images?.[0];

      if (!imageUrl) {
        console.log("No image found");
        continue;
      }

      const result = await cloudinary.uploader.upload(imageUrl, {
        folder: "flipkart/products",
        public_id: `product-${product.id}`,
        overwrite: true,
      });

      console.log("Cloudinary URL:", result.secure_url);

      console.log("Product ready");

      // MongoDB insertion will go here
    }

    await mongoose.disconnect();

    console.log("Migration finished");
  } catch (error) {
    console.error(error);

    await mongoose.disconnect();

    process.exit(1);
  }
};

migrateProducts();
