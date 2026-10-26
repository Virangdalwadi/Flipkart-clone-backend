import Product from "../../models/product.model.js";
import Counter from "../../models/counter.model.js";

const editableFields = new Set([
  "title",
  "description",
  "category",
  "brand",
  "sku",
  "price",
  "discountPercentage",
  "rating",
  "stock",
  "images",
  "thumbnail",
]);

const sortableFields = new Set([
  "id",
  "title",
  "price",
  "rating",
  "stock",
  "createdAt",
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function validateProductFields(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Product data must be an object" };
  }

  const unsupportedField = Object.keys(body).find(
    (field) => !editableFields.has(field),
  );
  if (unsupportedField) {
    return { error: `Field '${unsupportedField}' cannot be set` };
  }

  if (partial && Object.keys(body).length === 0) {
    return { error: "At least one editable field is required" };
  }

  const validated = {};
  const requiredStrings = ["title", "description", "category"];
  const optionalStrings = ["brand", "sku", "thumbnail"];

  for (const field of requiredStrings) {
    if (partial && !Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return { error: `${field} must be a non-empty string` };
    }
    validated[field] = body[field].trim();
  }

  for (const field of optionalStrings) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== "string") {
      return { error: `${field} must be a string` };
    }

    const value = body[field].trim();
    if (field === "thumbnail" && value && !isHttpUrl(value)) {
      return { error: "thumbnail must be an HTTP or HTTPS image URL" };
    }
    validated[field] = value;
  }

  const numericRules = {
    price: { min: 0 },
    discountPercentage: { min: 0, max: 100 },
    rating: { min: 0, max: 5 },
    stock: { min: 0, integer: true },
  };

  for (const [field, rule] of Object.entries(numericRules)) {
    if (partial && !Object.hasOwn(body, field)) continue;
    const value = body[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < rule.min ||
      (rule.max !== undefined && value > rule.max) ||
      (rule.integer && !Number.isInteger(value))
    ) {
      const range =
        rule.max === undefined
          ? `a number greater than or equal to ${rule.min}${rule.integer ? " and an integer" : ""}`
          : `a number between ${rule.min} and ${rule.max}`;
      return { error: `${field} must be ${range}` };
    }
    validated[field] = value;
  }

  if (Object.hasOwn(body, "images")) {
    if (
      !Array.isArray(body.images) ||
      body.images.some((image) => typeof image !== "string" || !isHttpUrl(image))
    ) {
      return { error: "images must be an array of HTTP or HTTPS image URLs" };
    }
    validated.images = body.images.map((image) => image.trim());
  }

  return { value: validated };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    return null;
  }
  return Number(value);
}

function parseProductId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const productId = Number(value);
  return Number.isSafeInteger(productId) ? productId : null;
}

function sendDatabaseError(error, res, next) {
  if (error?.code === 11000) {
    return res.status(409).json({
      message: "A product with this numeric ID already exists",
    });
  }
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({
      message: error.message || "Invalid product data",
    });
  }
  return next(error);
}

async function generateProductId() {
  const highestProduct = await Product.findOne()
    .sort({ id: -1 })
    .select({ id: 1 })
    .lean();
  const highestId = highestProduct?.id ?? 0;

  await Counter.findOneAndUpdate(
    { _id: "product" },
    { $max: { sequence: highestId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const counter = await Counter.findOneAndUpdate(
    { _id: "product" },
    { $inc: { sequence: 1 } },
    { new: true },
  );

  if (!counter || !Number.isSafeInteger(counter.sequence)) {
    throw new Error("Unable to allocate a product ID");
  }
  return counter.sequence;
}

export async function getProducts(req, res, next) {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const requestedLimit = parsePositiveInteger(req.query.limit, 20);
    if (page === null || requestedLimit === null) {
      return res.status(400).json({
        message: "Page and limit must be positive integers",
      });
    }

    const limit = Math.min(100, requestedLimit);
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({ message: "Page is too large" });
    }

    const { search, category, isActive, sortBy, order } = req.query;
    if (
      (search !== undefined && typeof search !== "string") ||
      (category !== undefined && typeof category !== "string") ||
      (isActive !== undefined &&
        isActive !== "true" &&
        isActive !== "false") ||
      (sortBy !== undefined &&
        (typeof sortBy !== "string" || !sortableFields.has(sortBy))) ||
      (order !== undefined && order !== "asc" && order !== "desc")
    ) {
      return res.status(400).json({ message: "Invalid product list filters" });
    }
    if (
      (typeof search === "string" && search.length > 100) ||
      (typeof category === "string" && category.length > 100)
    ) {
      return res.status(400).json({
        message: "Search and category filters must not exceed 100 characters",
      });
    }

    const filter = {};
    if (typeof search === "string" && search.trim()) {
      filter.title = {
        $regex: escapeRegex(search.trim()),
        $options: "i",
      };
    }
    if (typeof category === "string" && category.trim()) {
      filter.category = category.trim();
    }
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const sortField = sortBy || "id";
    const sortDirection = order === "desc" ? -1 : 1;
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getProductById(req, res, next) {
  const id = parseProductId(req.params.id);
  if (id === null) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const product = await Product.findOne({ id }).lean();
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json({ product });
  } catch (error) {
    return next(error);
  }
}

export async function createProduct(req, res, next) {
  const result = validateProductFields(req.body);
  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  try {
    const id = await generateProductId();
    const product = await Product.create({
      ...result.value,
      id,
      seller: req.user._id,
    });
    return res.status(201).json({ product });
  } catch (error) {
    return sendDatabaseError(error, res, next);
  }
}

export async function updateProduct(req, res, next) {
  const id = parseProductId(req.params.id);
  if (id === null) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  const result = validateProductFields(req.body, { partial: true });
  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  try {
    const product = await Product.findOneAndUpdate(
      { id },
      { $set: result.value },
      { new: true, runValidators: true },
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json({ product });
  } catch (error) {
    return sendDatabaseError(error, res, next);
  }
}

export async function updateProductStatus(req, res, next) {
  const id = parseProductId(req.params.id);
  if (id === null) {
    return res.status(400).json({ message: "Invalid product ID" });
  }
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    Object.keys(req.body).length !== 1 ||
    typeof req.body.isActive !== "boolean"
  ) {
    return res.status(400).json({
      message: "Request body must contain only a boolean isActive field",
    });
  }

  try {
    const product = await Product.findOneAndUpdate(
      { id },
      { $set: { isActive: req.body.isActive } },
      { new: true, runValidators: true },
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json({ product });
  } catch (error) {
    return sendDatabaseError(error, res, next);
  }
}

export async function deleteProduct(req, res, next) {
  const id = parseProductId(req.params.id);
  if (id === null) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const product = await Product.findOneAndUpdate(
      { id },
      { $set: { isActive: false } },
      { new: true, runValidators: true },
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json({
      message: "Product deactivated",
      product,
    });
  } catch (error) {
    return sendDatabaseError(error, res, next);
  }
}
