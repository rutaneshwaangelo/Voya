import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['passenger', 'driver', 'admin'],
      default: 'passenger',
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'blocked'],
      default: 'approved',
    },
    blockedFromStatus: {
      type: String,
      default: null,
    },
    location: {
      lat: { type: Number, default: -1.9441 }, // Kigali Center
      lng: { type: Number, default: 30.0619 },
      updatedAt: { type: Date, default: Date.now },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    autoOnline: {
      type: Boolean,
      default: true,
    },
    driverDetails: {
      licenseNumber: { type: String, default: null },
      nationalId: { type: String, default: null },
      plateNumber: { type: String, default: null },
      carType: { type: String, default: 'Standard Sedan' },
      carImageUrl: { type: String, default: null },
      paymentPhone: { type: String, default: null },
      rating: { type: Number, default: 5.0 },
      totalTrips: { type: Number, default: 0 },
      walletBalance: { type: Number, default: 0 },
    },
    recoveryCode: {
      type: String,
      default: null,
    },
    recoveryCodeExpiry: {
      type: Date,
      default: null,
    },
    resetToken: {
      type: String,
      default: null,
    },
    resetTokenExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Method to remove sensitive fields when returning JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.recoveryCode;
  delete obj.recoveryCodeExpiry;
  delete obj.resetToken;
  delete obj.resetTokenExpiry;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
