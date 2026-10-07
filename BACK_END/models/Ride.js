import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
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
    pickup: {
      address: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    destination: {
      address: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    fare: {
      type: Number,
      required: true,
    },
    distanceKm: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['requested', 'accepted', 'arrived', 'started', 'completed', 'cancelled'],
      default: 'requested',
    },
    driverLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
    passengerApproval: {
      type: String,
      enum: ['pending', 'approved', 'disputed'],
      default: 'pending',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Ride = mongoose.model('Ride', rideSchema);
export default Ride;
