import Address from "../models/address.model.js";

// Create Address
export async function createAddress(req, res) {
  try {
    const {
      name,
      mobile,
      pincode,
      locality,
      address,
      city,
      state,
      landmark,
      alternatePhone,
      isDefault,
    } = req.body;

    if (isDefault) {
      await Address.updateMany(
        { user: req.user._id },
        { $set: { isDefault: false } },
      );
    }

    const newAddress = await Address.create({
      user: req.user._id,
      name,
      mobile,
      pincode,
      locality,
      address,
      city,
      state,
      landmark,
      alternatePhone,
      isDefault: Boolean(isDefault),
    });

    return res.status(201).json({ address: newAddress });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    return res.status(500).json({ message: "Failed to create address" });
  }
}

// Get Address
export async function getAddresses(req, res) {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({
      isDefault: -1,
      createdAt: -1,
    });
    return res.status(200).json({ addresses });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch addresses" });
  }
}

// Get Address By id
export async function getAddressById(req, res) {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    return res.status(200).json({ address });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch address" });
  }
}

// Update Address
export async function updateAddress(req, res) {
  try {
    const { isDefault } = req.body;

    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    if (isDefault) {
      await Address.updateMany(
        { user: req.user._id, _id: { $ne: address._id } },
        { $set: { isDefault: false } },
      );
    }

    Object.assign(address, req.body);
    await address.save();

    return res.status(200).json({ address });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    return res.status(500).json({ message: "Failed to update address" });
  }
}

// Delete Address
export async function deleteAddress(req, res) {
  try {
    const address = await Address.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    return res.status(200).json({ message: "Address deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete address" });
  }
}
