import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"],
    },

    pincode: {
      type: String,
      required: [true, "Pincode is required"],
      match: [/^\d{6}$/, "Enter a valid 6-digit pincode"],
    },

    locality: {
      type: String,
      required: [true, "Locality is required"],
      trim: true,
    },

    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },

    city: {
      type: String,
      required: [true, "City/town/district is required"],
      trim: true,
    },

    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },

    landmark: {
      type: String,
      trim: true,
      default: "",
    },

    alternatePhone: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (value) {
          // Optional field: allow empty string
          if (!value) return true;

          return /^[6-9]\d{9}$/.test(value);
        },
        message: "Enter a valid 10-digit mobile number",
      },
    },

    // HOME / WORK
    addressType: {
      type: String,
      enum: ["Home", "Work"],
      required: [true, "Address type is required"],
      default: "Home",
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const Address = mongoose.model("Address", addressSchema);

export default Address;
