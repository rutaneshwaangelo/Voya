import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voya_db';

export async function connectDB() {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✓ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`⚠ MongoDB Connection Warning: ${error.message}`);
    console.warn(`  Make sure MongoDB is running on ${MONGODB_URI}`);
    console.warn(`  To start MongoDB locally on Windows: 'net start MongoDB' or launch 'mongod'`);
    return null;
  }
}

export default connectDB;
