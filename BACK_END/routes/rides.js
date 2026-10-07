import express from 'express';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// -------------------------------------------------------------
// 1. PASSENGER: REQUEST A RIDE
// -------------------------------------------------------------
router.post('/request', authenticateToken, requireRole(['passenger']), async (req, res) => {
  try {
    const { pickup, destination, fare, distanceKm } = req.body;

    if (!pickup || !destination || !fare) {
      return res.status(400).json({ error: 'Pickup location, destination, and fare are required' });
    }

    // Check if passenger already has an active ride
    const existingActive = await Ride.findOne({
      passenger: req.user.id,
      status: { $in: ['requested', 'accepted', 'arrived', 'started'] },
    });

    if (existingActive) {
      return res.status(400).json({
        error: 'You already have an active ride request in progress',
        activeRideId: existingActive._id,
      });
    }

    const newRide = new Ride({
      passenger: req.user.id,
      pickup: {
        address: pickup.address || 'Pickup Point',
        lat: pickup.lat,
        lng: pickup.lng,
      },
      destination: {
        address: destination.address || 'Destination Point',
        lat: destination.lat,
        lng: destination.lng,
      },
      fare: Number(fare),
      distanceKm: Number(distanceKm) || 0,
      status: 'requested',
    });

    await newRide.save();

    // Populate passenger details for response
    await newRide.populate('passenger', 'name phone username');

    res.status(201).json({
      message: 'Ride request submitted successfully',
      ride: newRide,
    });
  } catch (error) {
    console.error('Ride request error:', error);
    res.status(500).json({ error: 'Failed to request ride: ' + error.message });
  }
});

// -------------------------------------------------------------
// 2. GET CURRENT ACTIVE RIDE (For Passenger or Driver)
// -------------------------------------------------------------
router.get('/active', authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'passenger') {
      query = {
        passenger: req.user.id,
        status: { $in: ['requested', 'accepted', 'arrived', 'started'] },
      };
    } else if (req.user.role === 'driver') {
      query = {
        driver: req.user.id,
        status: { $in: ['accepted', 'arrived', 'started'] },
      };
    } else {
      // Admin: most recent active ride
      query = { status: { $in: ['requested', 'accepted', 'arrived', 'started'] } };
    }

    const activeRide = await Ride.findOne(query)
      .populate('passenger', 'name phone username email')
      .populate('driver', 'name phone username driverDetails isOnline location')
      .sort({ createdAt: -1 });

    res.json({ ride: activeRide || null });
  } catch (error) {
    console.error('Get active ride error:', error);
    res.status(500).json({ error: 'Failed to retrieve active ride' });
  }
});

// -------------------------------------------------------------
// 3. DRIVER: GET NEARBY / PENDING REQUESTS
// -------------------------------------------------------------
router.get('/nearby', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const driver = await User.findById(req.user.id);
    if (!driver || driver.status !== 'approved') {
      return res.status(403).json({ error: 'Driver account must be approved to receive ride requests' });
    }

    if (!driver.isOnline) {
      return res.status(400).json({ error: 'Go online to view nearby ride requests' });
    }

    // Find rides that are still requested
    const pendingRides = await Ride.find({ status: 'requested' })
      .populate('passenger', 'name phone username')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(pendingRides);
  } catch (error) {
    console.error('Get nearby rides error:', error);
    res.status(500).json({ error: 'Failed to fetch ride requests' });
  }
});

// -------------------------------------------------------------
// 4. DRIVER: ACCEPT A RIDE REQUEST
// -------------------------------------------------------------
router.post('/:id/accept', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const rideId = req.params.id;

    const driver = await User.findById(req.user.id);
    if (!driver || driver.status !== 'approved' || !driver.isOnline) {
      return res.status(403).json({ error: 'Driver must be online and approved to accept trips' });
    }

    // Check if driver already has an ongoing ride
    const currentOngoing = await Ride.findOne({
      driver: req.user.id,
      status: { $in: ['accepted', 'arrived', 'started'] },
    });

    if (currentOngoing) {
      return res.status(400).json({ error: 'You are currently serving another ride. Finish it first.' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride request not found' });
    }

    if (ride.status !== 'requested') {
      return res.status(400).json({ error: 'This ride has already been accepted by another driver' });
    }

    ride.driver = req.user.id;
    ride.status = 'accepted';
    ride.driverLocation = {
      lat: driver.location?.lat || -1.9441,
      lng: driver.location?.lng || 30.0619,
      updatedAt: new Date(),
    };

    await ride.save();
    await ride.populate('passenger', 'name phone username email');
    await ride.populate('driver', 'name phone driverDetails location');

    res.json({
      message: 'Ride accepted successfully',
      ride,
    });
  } catch (error) {
    console.error('Accept ride error:', error);
    res.status(500).json({ error: 'Failed to accept ride' });
  }
});

// -------------------------------------------------------------
// 5. DRIVER: UPDATE RIDE STATUS (arrived -> started -> completed)
// -------------------------------------------------------------
router.post('/:id/status', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const rideId = req.params.id;
    const { status } = req.body;

    if (!['arrived', 'started', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid ride status' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (String(ride.driver) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized. You are not assigned to this ride.' });
    }

    ride.status = status;
    if (status === 'started') {
      ride.startedAt = new Date();
    } else if (status === 'completed') {
      ride.completedAt = new Date();

      // Update driver statistics and wallet
      const driver = await User.findById(req.user.id);
      if (driver) {
        const driverEarnings = Math.round(ride.fare * 0.8); // 80% to driver
        driver.driverDetails.walletBalance = (driver.driverDetails.walletBalance || 0) + driverEarnings;
        driver.driverDetails.totalTrips = (driver.driverDetails.totalTrips || 0) + 1;
        await driver.save();
      }
    }

    await ride.save();

    res.json({
      message: `Ride status updated to ${status}`,
      status: ride.status,
      ride,
    });
  } catch (error) {
    console.error('Update ride status error:', error);
    res.status(500).json({ error: 'Failed to update ride status' });
  }
});

// -------------------------------------------------------------
// 6. UPDATE DRIVER LIVE LOCATION ON ACTIVE TRIP
// -------------------------------------------------------------
router.post('/:id/location', authenticateToken, requireRole(['driver']), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride || String(ride.driver) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Active ride not found for driver' });
    }

    ride.driverLocation = { lat, lng, updatedAt: new Date() };
    await ride.save();

    // Also update driver user model
    await User.findByIdAndUpdate(req.user.id, {
      location: { lat, lng, updatedAt: new Date() },
    });

    res.json({ success: true, location: { lat, lng } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// -------------------------------------------------------------
// 7. CANCEL RIDE (Passenger or Driver)
// -------------------------------------------------------------
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const rideId = req.params.id;
    const { reason } = req.body;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Verify authorized party
    const isPassenger = String(ride.passenger) === String(req.user.id);
    const isDriver = String(ride.driver) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!isPassenger && !isDriver && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized to cancel this trip' });
    }

    if (['completed', 'cancelled'].includes(ride.status)) {
      return res.status(400).json({ error: 'Cannot cancel an already completed or cancelled ride' });
    }

    ride.status = 'cancelled';
    ride.cancellationReason = reason || 'Cancelled by user';
    await ride.save();

    res.json({ message: 'Ride successfully cancelled', ride });
  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({ error: 'Failed to cancel ride' });
  }
});

// -------------------------------------------------------------
// 8. PASSENGER: APPROVE COMPLETED TRIP
// -------------------------------------------------------------
router.post('/:id/approve', authenticateToken, requireRole(['passenger']), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (String(ride.passenger) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { approval } = req.body; // 'approved' or 'disputed'
    ride.passengerApproval = approval === 'disputed' ? 'disputed' : 'approved';
    await ride.save();

    res.json({ message: `Ride delivery ${ride.passengerApproval}`, ride });
  } catch (error) {
    res.status(500).json({ error: 'Approval update failed' });
  }
});

// -------------------------------------------------------------
// 9. RIDE HISTORY (Role-aware)
// -------------------------------------------------------------
router.get('/history', authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'passenger') {
      query = { passenger: req.user.id };
    } else if (req.user.role === 'driver') {
      query = { driver: req.user.id };
    } // admin gets all

    const history = await Ride.find(query)
      .populate('passenger', 'name phone username')
      .populate('driver', 'name phone driverDetails')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ride history' });
  }
});

export default router;
