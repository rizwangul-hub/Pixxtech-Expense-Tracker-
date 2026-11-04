import mongoose from 'mongoose';

const systemUpdateSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: [true, 'Version number is required'],
      trim: true,
      default: '2.6.0',
    },
    buildId: {
      type: String,
      trim: true,
      default: () => `build_${Date.now()}`,
    },
    updateType: {
      type: String,
      enum: ['NORMAL', 'CRITICAL'],
      default: 'NORMAL',
    },
    title: {
      type: String,
      required: [true, 'Update title is required'],
      trim: true,
      default: '🚀 System Update Available!',
    },
    description: {
      type: [String],
      default: [
        'New system features and performance enhancements',
        'Stability improvements and user experience updates',
      ],
    },
    criticalDeadline: {
      type: Date,
      default: null,
    },
    minSupportedVersion: {
      type: String,
      default: null,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedByName: {
      type: String,
      default: 'System Administrator',
    },
  },
  {
    timestamps: true,
  }
);

systemUpdateSchema.index({ active: 1, createdAt: -1 });

export default mongoose.model('SystemUpdate', systemUpdateSchema);
