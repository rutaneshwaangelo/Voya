import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import SMSService from '../services/smsService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'voya_jwt_secret_rwanda_2026_rf_mobility_key';

/**
 * Validate MTN Rwanda Phone Number
 * Allowed formats:
 *   - 078xxxxxxx, 079xxxxxxx (10 digits)
 *   - +25078xxxxxxx, +25079xxxxxxx (13 chars)
 *   - 25078xxxxxxx, 25079xxxxxxx (12 digits)
 */
function isMtnRwandaPhone(phone) {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\s+/g, '');
  // Matches 078, 079, +25078, +25079, 25078, 25079 followed by 7 digits
  return /^((\+?250)|0)(78|79)\d{7}$/.test(cleanPhone);
}

// -------------------------------------------------------------
// 1. USER REGISTRATION
// -------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      phone,
      password,
      role = 'passenger',
      licenseNumber,
      nationalId,
      plateNumber,
      carType,
      carImageUrl,
      paymentPhone,
    } = req.body;

    if (!name || !username || !email || !phone || !password) {
      return res.status(400).json({ error: 'Name, username, email, phone, and password are required' });
    }

    // Role validation
    if (!['passenger', 'driver', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid user role specified' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // STRICT DRIVER REQUIREMENT: MTN Rwanda Number ONLY
    if (role === 'driver') {
      if (!isMtnRwandaPhone(phone)) {
        return res.status(400).json({
          error: 'Drivers must use an MTN Rwanda phone number (078xxxxxxx or 079xxxxxxx). Airtel numbers or foreign networks are not accepted for drivers.',
        });
      }

      if (!licenseNumber || !nationalId || !plateNumber || !paymentPhone) {
        return res.status(400).json({
          error: 'Drivers must provide driving license number, 16-digit National ID, vehicle plate number, and MTN MoMo payment phone.',
        });
      }

      // Check National ID format (Rwanda National ID is 16 digits)
      const cleanNationalId = nationalId.replace(/\s+/g, '');
      if (!/^\d{16}$/.test(cleanNationalId)) {
        return res.status(400).json({
          error: 'National ID must be exactly 16 digits long.',
        });
      }

      // Check payment phone is also MTN MoMo
      if (!isMtnRwandaPhone(paymentPhone)) {
        return res.status(400).json({
          error: 'Driver payment phone for MoMo cashouts must be an MTN Rwanda number (078xxxxxxx or 079xxxxxxx).',
        });
      }
    }

    // Prevent multiple admin accounts if one already exists
    if (role === 'admin') {
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(403).json({
          error: 'An Admin account already exists. For security, only one admin account is permitted.',
        });
      }
    }

    // Check duplicate username, email, phone
    const duplicateUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { phone: phone.trim() },
        { username: username.toLowerCase().trim() },
      ],
    });

    if (duplicateUser) {
      if (duplicateUser.email === email.toLowerCase()) {
        return res.status(400).json({ error: 'Email is already registered' });
      }
      if (duplicateUser.phone === phone.trim()) {
        return res.status(400).json({ error: 'Phone number is already registered' });
      }
      if (duplicateUser.username === username.toLowerCase().trim()) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Initial status: Drivers need admin approval, others start approved
    const status = role === 'driver' ? 'pending' : 'approved';

    // Create user record
    const newUser = new User({
      name: name.trim(),
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password: hashedPassword,
      role,
      status,
      driverDetails:
        role === 'driver'
          ? {
              licenseNumber: licenseNumber.trim(),
              nationalId: nationalId.trim(),
              plateNumber: plateNumber.toUpperCase().trim(),
              carType: carType || 'Standard Sedan',
              carImageUrl: carImageUrl || null,
              paymentPhone: paymentPhone.trim(),
              walletBalance: 0,
            }
          : undefined,
    });

    await newUser.save();

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser._id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        status: newUser.status,
      },
      note:
        role === 'driver'
          ? 'Your driver application has been submitted and is pending verification by VOYA Admin.'
          : 'Account created and ready to use.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// -------------------------------------------------------------
// 2. USER LOGIN (Supports Email, Phone, OR Username)
// -------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide your email, phone, or username and password' });
    }

    const cleanIdentifier = identifier.trim();

    // Look up user by email, phone, or username
    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier.toLowerCase() },
        { phone: cleanIdentifier },
        { username: cleanIdentifier.toLowerCase() },
      ],
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    // Check account block status
    if (user.status === 'blocked') {
      return res.status(403).json({
        error: 'Your account has been suspended by VOYA administration. Please contact support.',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password. Please check and try again.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        isOnline: user.isOnline,
        driverDetails: user.driverDetails,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login error: ' + error.message });
  }
});

// -------------------------------------------------------------
// 3. PASSWORD RECOVERY - INITIATE (Sends 6-digit Code)
// -------------------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }

    const cleanIdentifier = identifier.trim();

    // Find user by email or phone
    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier.toLowerCase() },
        { phone: cleanIdentifier },
        { username: cleanIdentifier.toLowerCase() },
      ],
    });

    if (!user) {
      return res.status(404).json({ error: 'No VOYA account found matching that email or phone number' });
    }

    // Generate 6-digit verification code & 10-minute expiry
    const recoveryCode = SMSService.generateCode();
    const expiry = SMSService.getCodeExpiry(10);

    user.recoveryCode = recoveryCode;
    user.recoveryCodeExpiry = expiry;
    await user.save();

    // Simulate SMS dispatch to user's registered phone
    await SMSService.sendVerificationCode(user.phone, recoveryCode, 'password_reset');

    res.json({
      message: 'Password recovery code sent',
      userId: user._id,
      phoneHint: user.phone.slice(0, 4) + '***' + user.phone.slice(-3),
      expiresIn: '10 minutes',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password recovery error: ' + error.message });
  }
});

// -------------------------------------------------------------
// 4. VERIFY RECOVERY CODE
// -------------------------------------------------------------
router.post('/verify-recovery-code', async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and recovery code are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.recoveryCode || user.recoveryCode !== code.trim()) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (SMSService.isCodeExpired(user.recoveryCodeExpiry)) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Generate single-use password reset token (valid for 15 mins)
    const resetToken = jwt.sign({ id: user._id, purpose: 'password_reset' }, JWT_SECRET, {
      expiresIn: '15m',
    });

    user.resetToken = resetToken;
    user.resetTokenExpiry = SMSService.getCodeExpiry(15);
    user.recoveryCode = null; // Consume the code
    user.recoveryCodeExpiry = null;
    await user.save();

    res.json({
      message: 'Code verified successfully',
      resetToken,
      userId: user._id,
    });
  } catch (error) {
    console.error('Verify recovery code error:', error);
    res.status(500).json({ error: 'Code verification error: ' + error.message });
  }
});

// -------------------------------------------------------------
// 5. RESET PASSWORD
// -------------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, resetToken, newPassword } = req.body;

    if (!userId || !resetToken || !newPassword) {
      return res.status(400).json({ error: 'User ID, reset token, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Verify token
    try {
      jwt.verify(resetToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired reset session' });
    }

    const user = await User.findById(userId);
    if (!user || user.resetToken !== resetToken) {
      return res.status(401).json({ error: 'Invalid reset token' });
    }

    if (SMSService.isCodeExpired(user.resetTokenExpiry)) {
      return res.status(400).json({ error: 'Reset session expired. Please restart recovery process.' });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset error: ' + error.message });
  }
});

// -------------------------------------------------------------
// 6. GET CURRENT USER PROFILE
// -------------------------------------------------------------
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

export default router;
