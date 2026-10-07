import express from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import SMSService from '../services/smsService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Apply admin authentication to all routes in this file
router.use(authenticateToken);
router.use(requireRole(['admin']));

// -------------------------------------------------------------
// 1. ADMIN REAL-TIME LIVE FLEET & PASSENGER JOURNEY MAP
// -------------------------------------------------------------
router.get('/live-map', async (req, res) => {
  try {
    // 1. All Drivers with location and status
    const allDrivers = await User.find({ role: 'driver' })
      .select('name username phone status isOnline location driverDetails')
      .lean();

    // 2. All Active Rides (where passengers and drivers are reaching on their journey)
    const activeRides = await Ride.find({
      status: { $in: ['requested', 'accepted', 'arrived', 'started'] },
    })
      .populate('passenger', 'name phone username')
      .populate('driver', 'name phone username driverDetails')
      .lean();

    // Format drivers with their current trip status if any
    const driversWithTripStatus = allDrivers.map(driver => {
      const activeTrip = activeRides.find(
        r => r.driver && String(r.driver._id) === String(driver._id)
      );

      return {
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        status: driver.status, // 'approved', 'pending', 'blocked'
        isOnline: Boolean(driver.isOnline),
        location: driver.location || { lat: -1.9441, lng: 30.0619 },
        plateNumber: driver.driverDetails?.plateNumber || 'N/A',
        carType: driver.driverDetails?.carType || 'Standard',
        currentTrip: activeTrip
          ? {
              rideId: activeTrip._id,
              status: activeTrip.status,
              pickup: activeTrip.pickup,
              destination: activeTrip.destination,
              passengerName: activeTrip.passenger?.name,
              driverLocation: activeTrip.driverLocation || driver.location,
            }
          : null,
      };
    });

    // Format active journeys for live map rendering
    const journeys = activeRides.map(ride => ({
      rideId: ride._id,
      status: ride.status,
      fare: ride.fare,
      passenger: {
        id: ride.passenger?._id,
        name: ride.passenger?.name,
        phone: ride.passenger?.phone,
      },
      driver: ride.driver
        ? {
            id: ride.driver?._id,
            name: ride.driver?.name,
            phone: ride.driver?.phone,
            plateNumber: ride.driver?.driverDetails?.plateNumber,
          }
        : null,
      pickup: ride.pickup,
      destination: ride.destination,
      currentDriverLocation: ride.driverLocation || null,
      startedAt: ride.startedAt,
      createdAt: ride.createdAt,
    }));

    res.json({
      timestamp: new Date(),
      totalOnlineDrivers: driversWithTripStatus.filter(d => d.isOnline).length,
      activeTripsCount: journeys.length,
      drivers: driversWithTripStatus,
      activeJourneys: journeys,
    });
  } catch (error) {
    console.error('Admin live map error:', error);
    res.status(500).json({ error: 'Failed to fetch live fleet map data: ' + error.message });
  }
});

// -------------------------------------------------------------
// 2. PENDING DRIVER VERIFICATION QUEUE
// -------------------------------------------------------------
router.get('/drivers/pending', async (req, res) => {
  try {
    const pendingDrivers = await User.find({
      role: 'driver',
      status: 'pending',
    }).sort({ createdAt: -1 });

    res.json(pendingDrivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending driver applications' });
  }
});

// -------------------------------------------------------------
// 3. APPROVE DRIVER REGISTRATION
// -------------------------------------------------------------
router.post('/drivers/:id/approve', async (req, res) => {
  try {
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) {
      return res.status(404).json({ error: 'Driver application not found' });
    }

    driver.status = 'approved';
    await driver.save();

    // Send congratulatory SMS
    await SMSService.sendVerificationCode(driver.phone, '', 'driver_activation');

    res.json({
      message: `Driver ${driver.name} has been approved and activated`,
      driver,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve driver' });
  }
});

// -------------------------------------------------------------
// 4. REJECT DRIVER APPLICATION
// -------------------------------------------------------------
router.delete('/drivers/:id/reject', async (req, res) => {
  try {
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Driver registration rejected and application removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject driver' });
  }
});

// -------------------------------------------------------------
// 5. BLOCK USER (Passenger or Driver)
// -------------------------------------------------------------
router.post('/users/:id/block', async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Cannot block your own admin account' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Save previous status so unblock can restore accurately
    user.blockedFromStatus = user.status !== 'blocked' ? user.status : 'approved';
    user.status = 'blocked';
    user.isOnline = false;
    await user.save();

    res.json({ message: `${user.name} (${user.role}) has been blocked`, user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// -------------------------------------------------------------
// 6. UNBLOCK USER
// -------------------------------------------------------------
router.post('/users/:id/unblock', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Restore to original status (e.g. 'pending' if driver was pending, or 'approved')
    const restoredStatus = user.blockedFromStatus || 'approved';
    user.status = restoredStatus;
    user.blockedFromStatus = null;
    await user.save();

    res.json({
      message: `${user.name} has been unblocked and restored to ${restoredStatus} status`,
      user,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// -------------------------------------------------------------
// 7. PLATFORM METRICS & FINANCIALS (80/20 Split)
// -------------------------------------------------------------
router.get('/metrics', async (req, res) => {
  try {
    const totalPassengers = await User.countDocuments({ role: 'passenger' });
    const totalDrivers = await User.countDocuments({ role: 'driver' });
    const approvedDrivers = await User.countDocuments({ role: 'driver', status: 'approved' });
    const pendingDrivers = await User.countDocuments({ role: 'driver', status: 'pending' });
    const onlineDrivers = await User.countDocuments({ role: 'driver', isOnline: true });

    const totalRides = await Ride.countDocuments();
    const completedRides = await Ride.countDocuments({ status: 'completed' });
    const cancelledRides = await Ride.countDocuments({ status: 'cancelled' });
    const activeRides = await Ride.countDocuments({ status: { $in: ['requested', 'accepted', 'arrived', 'started'] } });

    // Financial volume
    const completedPayments = await Payment.find({ status: 'completed' });
    const totalVolume = completedPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalCommission = completedPayments.reduce((acc, p) => acc + (p.commission || 0), 0);
    const totalDriverEarnings = completedPayments.reduce((acc, p) => acc + (p.driverEarnings || 0), 0);

    res.json({
      users: {
        passengers: totalPassengers,
        drivers: {
          total: totalDrivers,
          approved: approvedDrivers,
          pending: pendingDrivers,
          online: onlineDrivers,
        },
      },
      rides: {
        total: totalRides,
        completed: completedRides,
        cancelled: cancelledRides,
        active: activeRides,
      },
      financials: {
        totalVolume,
        voyaCommission: totalCommission, // 20%
        driverPayouts: totalDriverEarnings, // 80%
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate platform metrics' });
  }
});

// -------------------------------------------------------------
// 8. ALL USERS LIST (With search and filtering)
// -------------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const { role, status, search } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// -------------------------------------------------------------
// 9. GLOBAL RIDE LEDGER
// -------------------------------------------------------------
router.get('/rides', async (req, res) => {
  try {
    const rides = await Ride.find()
      .populate('passenger', 'name phone username')
      .populate('driver', 'name phone driverDetails')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(rides);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ride ledger' });
  }
});

export default router;
