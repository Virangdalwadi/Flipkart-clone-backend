import Product from "../models/product.model.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Get Products
export async function getProducts(req, res, next) {
  try {
    const { page = 1, limit = 20, category, search } = req.query;

    const pageNumber = Number(page);
    const requestedLimit = Number(limit);
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isSafeInteger(requestedLimit) ||
      requestedLimit < 1
    ) {
      return res.status(400).json({
        message: "Page and limit must be positive integers",
      });
    }
    if (
      (category !== undefined && typeof category !== "string") ||
      (search !== undefined && typeof search !== "string")
    ) {
      return res.status(400).json({
        message: "Category and search must be strings",
      });
    }
    if (typeof category === "string" && category.length > 100) {
      return res.status(400).json({ message: "Category is too long" });
    }
    if (typeof search === "string" && search.length > 100) {
      return res.status(400).json({ message: "Search query is too long" });
    }

    const limitNumber = Math.min(100, requestedLimit);
    const skip = (pageNumber - 1) * limitNumber;
    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({
        message: "Page is too large",
      });
    }

    const filter = { isActive: true };

    if (typeof category === "string" && category.trim()) {
      filter.category = category.trim();
    }

    if (typeof search === "string" && search.trim()) {
      const searchRegex = {
        $regex: escapeRegex(search.trim()),
        $options: "i",
      };
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ id: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      products,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    next(error);
  }
}

// Get Products by ID
export async function getProductById(req, res, next) {
  try {
    const productId = Number(req.params.id);

    // Validate the product ID
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    // Find the active product in MongoDB
    const product = await Product.findOne({
      id: productId,
      isActive: true,
    }).lean();

    // Product not found
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    return res.status(200).json({
      product,
    });
  } catch (error) {
    next(error);
  }
}
