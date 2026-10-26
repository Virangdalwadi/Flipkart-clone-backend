export function sellerMiddleware(req, res, next) {
  try {
    // Ensure the existing authentication middleware ran first.
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Allow only users with the seller role.
    if (req.user.role !== "seller") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Seller account required.",
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Seller authorization failed",
    });
  }
}

export default sellerMiddleware;
