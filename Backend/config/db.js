import mongoose from 'mongoose';

/**
 * Global cached Mongoose connection for Vercel Serverless environment
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connect to MongoDB database safely in Serverless & Node environments
 * @returns {Promise<typeof mongoose>}
 */
export const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixx_expense_tracker';
    if (!process.env.MONGO_URI) {
      console.warn('[MongoDB Warning]: MONGO_URI environment variable is not defined in environment settings.');
    }

    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
    };

    cached.promise = mongoose
      .connect(mongoURI, opts)
      .then((mongooseInstance) => {
        console.log(`[MongoDB Connected]: ${mongooseInstance.connection.host} / ${mongooseInstance.connection.name}`);
        return mongooseInstance;
      })
      .catch((err) => {
        cached.promise = null;
        console.error(`[MongoDB Connection Error]: ${err.message}`);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};

export default connectDB;
