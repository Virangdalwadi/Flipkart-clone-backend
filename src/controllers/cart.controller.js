import fs from "fs";
import Cart from "../models/cart.model.js";

const getCartResponse = (cart, userId) => ({
  success: true,
  cart: cart || { userId, items: [] },
});

const parseProductId = (value) => {
  const productId = Number(value);
  return Number.isInteger(productId) && productId > 0 ? productId : null;
};

const getProductCatalog = () => {
  try {
    const raw = fs.readFileSync(
      new URL("../../Data.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    const products = Array.isArray(parsed?.products) ? parsed.products : [];

    return new Map(
      products
        .map((product) => {
          const productId = Number(product?.id);
          return Number.isInteger(productId) && productId > 0
            ? [productId, product]
            : null;
        })
        .filter(Boolean),
    );
  } catch {
    return new Map();
  }
};

const validateItemInput = (body) => {
  const productId = parseProductId(body.productId);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const price = Number(body.price);
  const quantity = Number(body.quantity);

  if (!productId)
    return "Product ID is required and must be a positive integer";
  if (!title) return "Product title is required";
  if (!Number.isFinite(price) || price <= 0) {
    return "Price must be a valid positive number";
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "Quantity must be a positive integer";
  }

  return null;
};

const handleDatabaseError = (res, error, fallbackMessage) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A cart already exists for this user",
    });
  }

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid cart data",
    });
  }

  return res.status(500).json({ success: false, message: fallbackMessage });
};

export async function getCart(req, res) {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    return res.status(200).json(getCartResponse(cart, req.user._id));
  } catch (error) {
    return handleDatabaseError(res, error, "Unable to fetch cart");
  }
}

export async function addToCart(req, res) {
  const validationError = validateItemInput(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const productId = parseProductId(req.body.productId);
  const quantity = Number(req.body.quantity);

  try {
    let cart = await Cart.findOne({ userId: req.user._id });
    const existingItem = cart?.items.find(
      (item) => item.productId === productId,
    );

    if (existingItem) {
      existingItem.quantity += quantity;
      await cart.save();
    } else if (cart) {
      cart.items.push({
        productId,
        title: req.body.title.trim(),
        price: Number(req.body.price),
        image: req.body.image,
        quantity,
      });
      await cart.save();
    } else {
      cart = await Cart.create({
        userId: req.user._id,
        items: [
          {
            productId,
            title: req.body.title.trim(),
            price: Number(req.body.price),
            image: req.body.image,
            quantity,
          },
        ],
      });
    }

    return res.status(200).json(getCartResponse(cart, req.user._id));
  } catch (error) {
    return handleDatabaseError(res, error, "Unable to add item to cart");
  }
}

export async function mergeGuestCart(req, res) {
  const guestItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!guestItems.length) {
    return res.status(200).json({
      success: true,
      message: "Guest cart is empty",
      cart: { userId: req.user._id, items: [] },
    });
  }

  const productCatalog = getProductCatalog();
  const aggregatedGuestItems = new Map();

  for (const item of guestItems) {
    const guestProductId = parseProductId(
      item?.productId ?? item?.id ?? item?.btn_id,
    );
    const guestQuantity = Number(item?.quantity);

    if (
      !guestProductId ||
      !Number.isInteger(guestQuantity) ||
      guestQuantity < 1
    ) {
      continue;
    }

    const currentQuantity = aggregatedGuestItems.get(guestProductId) || 0;
    aggregatedGuestItems.set(guestProductId, currentQuantity + guestQuantity);
  }

  if (!aggregatedGuestItems.size) {
    return res.status(400).json({
      success: false,
      message: "No valid guest cart items were provided",
    });
  }

  try {
    let cart = await Cart.findOne({ userId: req.user._id });

    for (const [productId, quantity] of aggregatedGuestItems.entries()) {
      const product = productCatalog.get(productId);
      if (!product) continue;

      const existingItem = cart?.items.find(
        (item) => item.productId === productId,
      );
      const currentCartQuantity = existingItem ? existingItem.quantity : 0;
      const stock = Number(product.stock) || 0;
      const availableSpace = Math.max(stock - currentCartQuantity, 0);
      const acceptedQuantity = Math.min(quantity, availableSpace);

      if (!acceptedQuantity) continue;

      if (existingItem) {
        existingItem.quantity += acceptedQuantity;
        existingItem.title = product.title || existingItem.title;
        existingItem.price = Number(product.price) || existingItem.price;
        existingItem.image =
          Array.isArray(product.images) && product.images.length
            ? product.images[0]
            : product.thumbnail || existingItem.image;
      } else {
        const nextItems = cart?.items || [];
        const newItem = {
          productId,
          title: product.title,
          price: Number(product.price) || 0,
          image:
            Array.isArray(product.images) && product.images.length
              ? product.images[0]
              : product.thumbnail || "",
          quantity: acceptedQuantity,
        };

        if (cart) {
          cart.items.push(newItem);
        } else {
          cart = await Cart.create({
            userId: req.user._id,
            items: [newItem],
          });
        }
      }
    }

    if (cart) {
      await cart.save();
    }

    const refreshedCart = await Cart.findOne({ userId: req.user._id });
    return res.status(200).json(getCartResponse(refreshedCart, req.user._id));
  } catch (error) {
    return handleDatabaseError(res, error, "Unable to merge guest cart");
  }
}

export async function updateCartItem(req, res) {
  const productId = parseProductId(req.params.productId);
  const quantity = Number(req.body.quantity);

  if (!productId) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid product ID" });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be a positive integer",
    });
  }

  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    const item = cart?.items.find(
      (cartItem) => cartItem.productId === productId,
    );

    if (!cart || !item) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in cart" });
    }

    item.quantity = quantity;
    await cart.save();
    return res.status(200).json(getCartResponse(cart, req.user._id));
  } catch (error) {
    return handleDatabaseError(res, error, "Unable to update cart item");
  }
}

export async function removeCartItem(req, res) {
  const productId = parseProductId(req.params.productId);
  if (!productId) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid product ID" });
  }

  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart || !cart.items.some((item) => item.productId === productId)) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in cart" });
    }

    cart.items = cart.items.filter((item) => item.productId !== productId);
    await cart.save();
    return res.status(200).json(getCartResponse(cart, req.user._id));
  } catch (error) {
    return handleDatabaseError(res, error, "Unable to remove cart item");
  }
}

export async function clearCart(req, res) {
  try {
    await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { items: [] } },
    );
    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    return handleDatabaseError(res, error, "Unable to clear cart");
  }
}
