import express from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// -------------------------------------------------------------
// 1. TOGGLE DRIVER ONLINE / OFFLINE STATUS
// -------------------------------------------------------------
router.post('/online', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const { isOnline, lat, lng } = req.body;
    const driver = await User.findById(req.user.id);

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    if (driver.status !== 'approved') {
      return res.status(403).json({
        error: 'Your account is pending verification by VOYA Admin. You will be able to go online once approved.',
        status: driver.status,
      });
    }

    driver.isOnline = Boolean(isOnline);
    if (lat && lng) {
      driver.location = {
        lat: Number(lat),
        lng: Number(lng),
        updatedAt: new Date(),
      };
    }

    await driver.save();

    res.json({
      message: `You are now ${driver.isOnline ? 'ONLINE and accepting rides' : 'OFFLINE'}`,
      isOnline: driver.isOnline,
      location: driver.location,
    });
  } catch (error) {
    console.error('Toggle online error:', error);
    res.status(500).json({ error: 'Failed to update online status' });
  }
});

// -------------------------------------------------------------
// 2. TOGGLE AUTO-ONLINE SETTING
// -------------------------------------------------------------
router.post('/auto-online', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const { autoOnline } = req.body;
    const driver = await User.findById(req.user.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.autoOnline = Boolean(autoOnline);
    await driver.save();

    res.json({
      message: `Auto-online mode ${driver.autoOnline ? 'enabled' : 'disabled'}`,
      autoOnline: driver.autoOnline,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update auto-online setting' });
  }
});

// -------------------------------------------------------------
// 3. DRIVER EARNINGS WALLET & SUMMARY (80/20 Breakdown)
// -------------------------------------------------------------
router.get('/wallet', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const driver = await User.findById(req.user.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Retrieve completed rides
    const completedRides = await Ride.find({
      driver: req.user.id,
      status: 'completed',
    }).sort({ completedAt: -1 }).limit(20);

    const totalRevenueGenerated = completedRides.reduce((acc, r) => acc + (r.fare || 0), 0);
    const totalDriverEarnings = Math.round(totalRevenueGenerated * 0.8);
    const totalVoyaCommission = Math.round(totalRevenueGenerated * 0.2);

    res.json({
      walletBalance: driver.driverDetails?.walletBalance || totalDriverEarnings,
      totalTrips: driver.driverDetails?.totalTrips || completedRides.length,
      rating: driver.driverDetails?.rating || 5.0,
      paymentPhone: driver.driverDetails?.paymentPhone || driver.phone,
      totalRevenueGenerated,
      totalDriverEarnings,
      totalVoyaCommission,
      recentTrips: completedRides.map(r => ({
        id: r._id,
        pickup: r.pickup.address,
        destination: r.destination.address,
        totalFare: r.fare,
        driverNet: Math.round(r.fare * 0.8),
        commission: Math.round(r.fare * 0.2),
        date: r.completedAt || r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Driver wallet error:', error);
    res.status(500).json({ error: 'Failed to retrieve driver wallet' });
  }
});

export default router;
