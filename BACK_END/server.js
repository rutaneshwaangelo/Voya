import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

import { connectDB } from './config/db.js';
import User from './models/User.js';

import authRoutes from './routes/auth.js';
import ridesRoutes from './routes/rides.js';
import driversRoutes from './routes/drivers.js';
import adminRoutes from './routes/admin.js';
import paymentsRoutes from './routes/payments.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB().then(() => {
  seedDefaultAdmin();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Static assets: serve FRONT_END directory
const frontendPath = path.join(__dirname, '..', 'FRONT_END');
app.use(express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'VOYA Ride-Hailing Rwanda',
    version: '2.0.0',
    timestamp: new Date(),
  });
});

// Serve frontend SPA fallback (Express 5 compatible)
app.use((req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>VOYA Backend</title></head>
          <body style="font-family: sans-serif; background: #0f172a; color: white; padding: 2rem;">
            <h1>VOYA Backend API is Running</h1>
            <p>Port: ${PORT}</p>
            <p>API Endpoint: <a href="/api/health" style="color: #10b981;">/api/health</a></p>
          </body>
        </html>
      `);
    }
  });
});

// Seed default admin account if none exists
async function seedDefaultAdmin() {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const defaultAdmin = new User({
        name: 'VOYA Master Admin',
        username: 'admin',
        email: 'admin@voya.rw',
        phone: '0780000000',
        password: hashedPassword,
        role: 'admin',
        status: 'approved',
      });
      await defaultAdmin.save();
      console.log('✓ Default VOYA Admin seeded: 0780000000 / admin123 (email: admin@voya.rw)');
    }
  } catch (err) {
    console.warn('Could not check/seed admin:', err.message);
  }
}

// Start HTTP server
app.listen(PORT, () => {
  console.log(`
  ══════════════════════════════════════════════════════════════
  🚗 VOYA BACKEND v2.0 - RWANDA URBAN MOBILITY PLATFORM
  ══════════════════════════════════════════════════════════════
  ► URL:             http://localhost:${PORT}
  ► Health Check:    http://localhost:${PORT}/api/health
  ► Environment:     ${process.env.NODE_ENV || 'development'}
  ► Target Match:    ~2 seconds
  ► Commission:      20% VOYA / 80% Driver
  ► Driver Rule:     Strict MTN Rwanda (078/079) Required
  ══════════════════════════════════════════════════════════════
  `);
});
