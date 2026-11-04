import express from 'express';
import SystemUpdate from '../models/SystemUpdate.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   GET /api/system/version
 * @desc    Public version endpoint returning the latest deployed / broadcasted system version
 * @access  Public
 */
router.get('/version', async (req, res) => {
  try {
    const latestActive = await SystemUpdate.findOne({ active: true })
      .sort({ createdAt: -1 })
      .lean();

    const serverBuildId = process.env.VERCEL_GIT_COMMIT_SHA
      ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 9)
      : process.env.RENDER_GIT_COMMIT
      ? process.env.RENDER_GIT_COMMIT.slice(0, 9)
      : 'v2.6.0';

    return res.status(200).json({
      success: true,
      version: latestActive?.version || process.env.npm_package_version || '2.6.0',
      buildId: latestActive?.buildId || serverBuildId,
      updateType: latestActive?.updateType || 'NORMAL',
      title: latestActive?.title || '🚀 System Update Available!',
      description: latestActive?.description?.length
        ? latestActive.description
        : [
            'New system features and performance enhancements',
            'Stability improvements and user experience updates',
          ],
      criticalDeadline: latestActive?.criticalDeadline || null,
      minSupportedVersion: latestActive?.minSupportedVersion || null,
      serverTime: new Date().toISOString(),
      isCustomBroadcast: !!latestActive,
    });
  } catch (err) {
    console.error('[System Version Error]:', err.message);
    return res.status(200).json({
      success: true,
      version: '2.6.0',
      buildId: 'v2.6.0',
      updateType: 'NORMAL',
      title: '🚀 System Update Available!',
      description: ['General system enhancements and improvements.'],
      serverTime: new Date().toISOString(),
    });
  }
});

/**
 * @route   GET /api/system/history
 * @desc    Get history of all system updates and broadcasts
 * @access  Private (ADMIN, ADMIN_PUBLISHER)
 */
router.get(
  '/history',
  protect,
  authorize('ADMIN', 'ADMIN_PUBLISHER'),
  async (req, res) => {
    try {
      const updates = await SystemUpdate.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      return res.status(200).json({
        success: true,
        updates,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch update history.',
        error: err.message,
      });
    }
  }
);

/**
 * @route   POST /api/system/publish-update
 * @desc    Publish an official system update notice (Normal or Critical)
 * @access  Private (ADMIN, ADMIN_PUBLISHER)
 */
router.post(
  '/publish-update',
  protect,
  authorize('ADMIN', 'ADMIN_PUBLISHER'),
  async (req, res) => {
    try {
      const {
        version,
        updateType = 'NORMAL',
        title,
        description = [],
        deadlineMinutes,
        minSupportedVersion,
      } = req.body;

      if (!version || !title) {
        return res.status(400).json({
          success: false,
          message: 'Version and title are required.',
        });
      }

      // Calculate critical deadline if specified
      let criticalDeadline = null;
      if (updateType === 'CRITICAL' && deadlineMinutes && Number(deadlineMinutes) > 0) {
        criticalDeadline = new Date(Date.now() + Number(deadlineMinutes) * 60 * 1000);
      }

      // Deactivate older broadcasts if publishing a new active one
      await SystemUpdate.updateMany({ active: true }, { active: false });

      const newUpdate = await SystemUpdate.create({
        version: String(version).trim(),
        buildId: `bld_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        updateType,
        title: String(title).trim(),
        description: Array.isArray(description)
          ? description.filter((d) => Boolean(d && d.trim()))
          : [String(description)],
        criticalDeadline,
        minSupportedVersion: minSupportedVersion ? String(minSupportedVersion).trim() : null,
        active: true,
        publishedBy: req.user._id,
        publishedByName: req.user.name || 'Administrator',
      });

      return res.status(201).json({
        success: true,
        message: `${updateType === 'CRITICAL' ? 'Critical' : 'Normal'} system update published successfully.`,
        update: newUpdate,
      });
    } catch (err) {
      console.error('[Publish System Update Error]:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to publish system update.',
        error: err.message,
      });
    }
  }
);

/**
 * @route   PATCH /api/system/update/:id/toggle
 * @desc    Activate or deactivate an update notice
 * @access  Private (ADMIN, ADMIN_PUBLISHER)
 */
router.patch(
  '/update/:id/toggle',
  protect,
  authorize('ADMIN', 'ADMIN_PUBLISHER'),
  async (req, res) => {
    try {
      const update = await SystemUpdate.findById(req.params.id);
      if (!update) {
        return res.status(404).json({
          success: false,
          message: 'Update record not found.',
        });
      }

      update.active = !update.active;
      await update.save();

      return res.status(200).json({
        success: true,
        message: `Update ${update.active ? 'activated' : 'deactivated'} successfully.`,
        update,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to toggle update status.',
        error: err.message,
      });
    }
  }
);

export default router;
