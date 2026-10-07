import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    commission: {
      type: Number,
      required: true, // 20% VOYA flat commission
    },
    driverEarnings: {
      type: Number,
      required: true, // 80% Driver earnings
    },
    method: {
      type: String,
      enum: ['momo', 'airtel', 'cash'],
      required: true,
    },
    paymentPhone: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'verification_pending', 'completed', 'failed'],
      default: 'verification_pending',
    },
    transactionRef: {
      type: String,
      required: true,
      unique: true,
    },
    verificationCode: {
      type: String,
      default: null,
    },
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    verificationCodeExpiry: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
