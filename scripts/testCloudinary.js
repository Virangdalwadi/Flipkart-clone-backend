import "dotenv/config";
import cloudinary from "../src/config/cloudinary.js";

const imageUrl =
  "https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp";

try {
  const result = await cloudinary.uploader.upload(imageUrl, {
    folder: "flipkart/products",
    public_id: "product-1",
    overwrite: true,
  });

  console.log("Upload successful!");
  console.log("Cloudinary URL:");
  console.log(result.secure_url);
} catch (error) {
  console.error("Upload failed:", error);
}
