import express from 'express';
import Payment from '../models/Payment.js';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import SMSService from '../services/smsService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// -------------------------------------------------------------
// 1. PASSENGER: INITIATE PAYMENT (Sends 6-digit SMS Code)
// -------------------------------------------------------------
router.post('/initiate', authenticateToken, requireRole(['passenger']), async (req, res) => {
  try {
    const { rideId, method, phone, amount } = req.body;

    if (!rideId || !method || !phone || !amount) {
      return res.status(400).json({
        error: 'Ride ID, payment method (momo/airtel), phone number, and amount are required',
      });
    }

    if (!['momo', 'airtel'].includes(method)) {
      return res.status(400).json({ error: 'Payment method must be "momo" (MTN) or "airtel"' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (String(ride.passenger) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized payment attempt for this ride' });
    }

    // Check if payment already completed
    const existingCompleted = await Payment.findOne({ ride: rideId, status: 'completed' });
    if (existingCompleted) {
      return res.status(400).json({ error: 'This ride has already been paid for' });
    }

    const paymentAmount = Number(amount);
    if (paymentAmount < ride.fare) {
      return res.status(400).json({
        error: `Entered amount (${paymentAmount} RWF) cannot be less than ride fare (${ride.fare} RWF)`,
      });
    }

    // 80% Driver / 20% VOYA flat commission split
    const commission = Math.round(ride.fare * 0.2);
    const driverEarnings = Math.round(ride.fare * 0.8);

    // Generate 6-digit SMS code & 5-minute expiry
    const verificationCode = SMSService.generateCode();
    const expiry = SMSService.getCodeExpiry(5); // 5 mins

    // Unique transaction reference
    const transactionRef = `TXN-${method.toUpperCase()}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    // Create payment record
    const payment = new Payment({
      ride: ride._id,
      passenger: req.user.id,
      driver: ride.driver,
      amount: paymentAmount,
      commission,
      driverEarnings,
      method,
      paymentPhone: phone.trim(),
      status: 'verification_pending',
      transactionRef,
      verificationCode,
      verificationAttempts: 0,
      verificationCodeExpiry: expiry,
    });

    await payment.save();

    // Send simulated SMS verification code
    await SMSService.sendVerificationCode(phone, verificationCode, 'payment_verification');

    res.status(201).json({
      message: `Verification code sent to ${phone}`,
      paymentId: payment._id,
      transactionRef,
      amount: paymentAmount,
      method: method.toUpperCase(),
      phoneHint: phone.slice(0, 4) + '***' + phone.slice(-3),
      expiresIn: '5 minutes',
    });
  } catch (error) {
    console.error('Initiate payment error:', error);
    res.status(500).json({ error: 'Payment initiation failed: ' + error.message });
  }
});

// -------------------------------------------------------------
// 2. PASSENGER: VERIFY 6-DIGIT CODE & COMPLETE TRANSACTION
// -------------------------------------------------------------
router.post('/verify', authenticateToken, requireRole(['passenger']), async (req, res) => {
  try {
    const { paymentId, code } = req.body;

    if (!paymentId || !code) {
      return res.status(400).json({ error: 'Payment ID and 6-digit verification code are required' });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment transaction record not found' });
    }

    if (String(payment.passenger) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized payment verification attempt' });
    }

    if (payment.status === 'completed') {
      return res.status(400).json({ error: 'Payment is already completed and verified' });
    }

    // Security: Limit to max 3 attempts
    if (payment.verificationAttempts >= 3) {
      payment.status = 'failed';
      await payment.save();
      return res.status(400).json({
        error: 'Too many failed verification attempts (Max 3). This payment request has been cancelled for security. Please initiate a new payment.',
      });
    }

    // Check expiration
    if (SMSService.isCodeExpired(payment.verificationCodeExpiry)) {
      return res.status(400).json({
        error: 'Verification code has expired. Please request a new verification code.',
      });
    }

    // Validate 6-digit code
    if (payment.verificationCode !== code.trim()) {
      payment.verificationAttempts += 1;
      await payment.save();
      const attemptsLeft = 3 - payment.verificationAttempts;
      return res.status(400).json({
        error: `Incorrect verification code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`,
      });
    }

    // Code is valid! Complete transaction
    payment.status = 'completed';
    payment.verificationCode = null; // Clear code
    await payment.save();

    // Mark ride as completed
    await Ride.findByIdAndUpdate(payment.ride, {
      status: 'completed',
      completedAt: new Date(),
    });

    // Update driver wallet balance with 80% net earnings
    if (payment.driver) {
      await User.findByIdAndUpdate(payment.driver, {
        $inc: { 'driverDetails.walletBalance': payment.driverEarnings },
      });
    }

    // Send SMS receipt
    await SMSService.sendPaymentReceipt(payment.paymentPhone, {
      amount: payment.amount,
      method: payment.method,
      transactionRef: payment.transactionRef,
      driverEarnings: payment.driverEarnings,
      commission: payment.commission,
    });

    res.json({
      message: 'Payment verified and processed successfully',
      receipt: {
        transactionRef: payment.transactionRef,
        amount: payment.amount,
        method: payment.method.toUpperCase(),
        driverEarnings: payment.driverEarnings, // 80%
        voyaCommission: payment.commission,    // 20%
        status: 'completed',
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed: ' + error.message });
  }
});

// -------------------------------------------------------------
// 3. RESEND VERIFICATION CODE
// -------------------------------------------------------------
router.post('/resend-code', authenticateToken, requireRole(['passenger']), async (req, res) => {
  try {
    const { paymentId } = req.body;
    const payment = await Payment.findById(paymentId);

    if (!payment || payment.status !== 'verification_pending') {
      return res.status(404).json({ error: 'Active pending payment not found' });
    }

    // Generate new code and reset attempts
    const newCode = SMSService.generateCode();
    payment.verificationCode = newCode;
    payment.verificationCodeExpiry = SMSService.getCodeExpiry(5);
    payment.verificationAttempts = 0;
    await payment.save();

    await SMSService.sendVerificationCode(payment.paymentPhone, newCode, 'payment_verification');

    res.json({
      message: `New verification code sent to ${payment.paymentPhone}`,
      expiresIn: '5 minutes',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

export default router;
