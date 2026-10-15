import "dotenv/config";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cloudinary from "../src/config/cloudinary.js";
import Product from "../src/models/product.model.js";
import User from "../src/models/user.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "../Data.json");

const migrateProducts = async () => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

    const products = data.products;

    if (!Array.isArray(products)) {
      throw new Error('Data.json must contain a "products" array');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    // Use an existing user as the product seller.
    // Replace this query with your actual admin/seller selection
    // if your project uses a different account.
    const seller = await User.findOne({ role: "admin" }).select("_id");

    if (!seller) {
      throw new Error(
        "No admin user found. Create/promote your admin user first.",
      );
    }

    let migrated = 0;
    let failed = 0;

    for (const item of products) {
      try {
        if (
          item.id == null ||
          !item.title ||
          !item.description ||
          !item.category ||
          item.price == null
        ) {
          throw new Error("Missing required product fields");
        }

        console.log(`Processing: ${item.id} - ${item.title}`);

        const sourceImages = [
          ...(Array.isArray(item.images) ? item.images : []),
        ];

        if (item.thumbnail && !sourceImages.includes(item.thumbnail)) {
          sourceImages.unshift(item.thumbnail);
        }

        const cloudinaryImages = [];

        for (let i = 0; i < sourceImages.length; i++) {
          const imageUrl = sourceImages[i];

          if (!imageUrl) continue;

          const result = await cloudinary.uploader.upload(imageUrl, {
            folder: "flipkart/products",
            public_id: `product-${item.id}-${i + 1}`,
            overwrite: true,
          });

          cloudinaryImages.push(result.secure_url);
        }

        const productData = {
          id: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          brand: item.brand ?? "",
          sku: item.sku ?? "",
          price: item.price,
          discountPercentage: item.discountPercentage ?? 0,
          rating: item.rating ?? 0,
          stock: item.stock ?? 0,
          images: cloudinaryImages,
          thumbnail: cloudinaryImages[0] ?? item.thumbnail ?? "",
          seller: seller._id,
          isActive: true,
        };

        await Product.updateOne(
          { id: item.id },
          { $set: productData },
          {
            upsert: true,
            runValidators: true,
          },
        );

        migrated++;
        console.log(`Migrated: ${item.title}`);
      } catch (error) {
        failed++;
        console.error(`Failed product ${item.id}: ${error.message}`);
      }
    }

    console.log("\nMigration summary");
    console.log(`Total: ${products.length}`);
    console.log(`Successful: ${migrated}`);
    console.log(`Failed: ${failed}`);
  } catch (error) {
    console.error("Migration error:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

migrateProducts();
