import Product from "../../models/product.model.js";
import {
  createProduct,
  validateProductFields,
} from "../admin/adminProduct.controller.js";

const sortableFields = new Set(["id", "title", "price", "rating", "stock", "createdAt"]);

function parseProductId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

// GET: Get products belonging to the logged-in seller
export async function getSellerProduct(req, res) {
  try {
    const page = Number(req.query.page ?? 1);
    const requestedLimit = Number(req.query.limit ?? 20);
    const { search, category, isActive, sortBy, order } = req.query;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1 ||
      (search !== undefined && typeof search !== "string") ||
      (category !== undefined && typeof category !== "string") ||
      (typeof search === "string" && search.length > 100) ||
      (typeof category === "string" && category.length > 100) ||
      (isActive !== undefined && isActive !== "true" && isActive !== "false") ||
      (sortBy !== undefined && !sortableFields.has(sortBy)) ||
      (order !== undefined && order !== "asc" && order !== "desc")
    ) {
      return res.status(400).json({ success: false, message: "Invalid product list filters" });
    }

    const limit = Math.min(100, requestedLimit);
    if (!Number.isSafeInteger((page - 1) * limit)) {
      return res.status(400).json({ success: false, message: "Page is too large" });
    }
    const filter = {
      seller: req.user._id,
    };
    if (typeof search === "string" && search.trim()) {
      filter.title = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (typeof category === "string" && category.trim()) filter.category = category.trim();
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ [sortBy || "createdAt"]: order === "desc" ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get seller products error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch seller products",
    });
  }
}

// Share the validated, server-assigned product ID behavior with admin creation.
export async function createSellerProduct(req, res, next) {
  return createProduct(req, res, next);
}

// PATCH: Update a seller's own product
export async function updateSellerProduct(req, res) {
  const id = parseProductId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }
  const result = validateProductFields(req.body, { partial: true });
  if (result.error) {
    return res.status(400).json({ success: false, message: result.error });
  }

  try {
    const product = await Product.findOne({
      id,
      seller: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or access denied",
      });
    }

    Object.assign(product, result.value);
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Update seller product error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update product",
    });
  }
}

// DELETE: Delete a seller's own product
export async function deleteSellerProduct(req, res) {
  const id = parseProductId(req.params.id);
  if (id === null) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const product = await Product.findOneAndDelete({
      id,
      seller: req.user._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or access denied",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete seller product error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
}
