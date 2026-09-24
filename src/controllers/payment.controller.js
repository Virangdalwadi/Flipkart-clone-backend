import crypto from "crypto";
import Order from "../models/order.model.js";
import razorpay, { razorpayKeyId } from "../config/razorpay.js";

const requiredAddressFields = [
  "name",
  "mobile",
  "pincode",
  "locality",
  "address",
  "city",
  "state",
];
const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart is empty");
  }

  return items.map((item) => {
    const price = Number(item.price);
    const quantity = Number(item.quantity);

    if (
      !item.id ||
      !item.title ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error("Cart contains invalid product data");
    }

    return {
      productId: String(item.id),
      title: String(item.title),
      price,
      quantity,
      subtotal: price * quantity,
    };
  });
};

const normalizeAddress = (shippingAddress) => {
  if (
    !shippingAddress ||
    requiredAddressFields.some(
      (field) => !String(shippingAddress[field] || "").trim(),
    )
  ) {
    throw new Error("A complete shipping address is required");
  }

  const mobile = String(shippingAddress.mobile).trim();
  const pincode = String(shippingAddress.pincode).trim();

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new Error("A valid Indian mobile number is required");
  }

  if (!/^\d{6}$/.test(pincode)) {
    throw new Error("A valid six-digit pincode is required");
  }

  return {
    name: String(shippingAddress.name).trim(),
    mobile,
    pincode,
    locality: String(shippingAddress.locality).trim(),
    address: String(shippingAddress.address).trim(),
    city: String(shippingAddress.city).trim(),
    state: String(shippingAddress.state).trim(),
    landmark: String(shippingAddress.landmark || "").trim(),
    alternatePhone: String(shippingAddress.alternatePhone || "").trim(),
    addressType: shippingAddress.addressType === "work" ? "work" : "home",
  };
};

const calculateTotals = (items) => {
  const subtotal = items.reduce((total, item) => total + item.subtotal, 0);
  return { subtotal, totalAmount: subtotal };
};

export async function createRazorpayOrder(req, res) {
  try {
    const items = normalizeItems(req.body.items);
    const shippingAddress = normalizeAddress(req.body.shippingAddress);
    const { totalAmount } = calculateTotals(items);
    const amountInPaise = Math.round(totalAmount * 100);

    if (amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: "Order amount must be greater than zero",
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    });

    return res.status(201).json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: razorpayKeyId,
    });
  } catch (error) {
    const message =
      error.message === "Cart is empty" ||
      error.message === "Cart contains invalid product data" ||
      error.message === "A complete shipping address is required" ||
      error.message === "A valid Indian mobile number is required" ||
      error.message === "A valid six-digit pincode is required"
        ? error.message
        : "Unable to create payment order";
    return res.status(400).json({ success: false, message });
  }
}

export async function verifyPayment(req, res) {
  try {
    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res
        .status(400)
        .json({ success: false, message: "Payment details are incomplete" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(razorpaySignature, "hex");
    const signatureMatches =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!signatureMatches) {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    const items = normalizeItems(req.body.items);
    const shippingAddress = normalizeAddress(req.body.shippingAddress);
    const { subtotal, totalAmount } = calculateTotals(items);
    const order = await Order.create({
      userId: req.user._id,
      items,
      shippingAddress,
      subtotal,
      totalAmount,
      payment: {
        method: "razorpay",
        status: "paid",
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      },
      orderStatus: "PLACED",
    });

    return res.status(201).json({
      success: true,
      message: "Payment verified successfully",
      order,
    });
  } catch (error) {
    const message = [
      "Cart is empty",
      "Cart contains invalid product data",
      "A complete shipping address is required",
      "A valid Indian mobile number is required",
      "A valid six-digit pincode is required",
    ].includes(error.message)
      ? error.message
      : "Unable to verify payment";
    return res.status(400).json({ success: false, message });
  }
}
