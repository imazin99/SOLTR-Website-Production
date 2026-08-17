const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['Tee', 'Boxy', 'Hoodie', 'Accessory', 'Other'],
      default: 'Tee',
    },
    collection: {
      type: String,
      default: "SS'26",
      trim: true,
    },
    sizes: {
      type: [String],
      default: ['S', 'M', 'L', 'XL'],
    },
    colors: {
      type: [String],
      required: [true, 'At least one color is required'],
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    /* Optional size-specific quantities. An absent/empty map keeps legacy
       products on the existing aggregate-stock behavior. */
    sizeInventory: {
      type: Map,
      of: { type: Number, min: 0 },
      default: undefined,
    },
    // Stored as filenames only (e.g. "1234567890-abc.jpg")
    // Full URL: {backend base URL}/uploads/products/<filename>
    // e.g. http://localhost:5000/... locally, or your deployed backend URL in production
    images: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,   // adds createdAt + updatedAt automatically
    optimisticConcurrency: true,
  }
);

module.exports = mongoose.model('Product', productSchema);
