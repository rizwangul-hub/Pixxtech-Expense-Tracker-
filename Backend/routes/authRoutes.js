import express from 'express';
import { login, logout, heartbeat, getMe } from '../controllers/authController.js';
import { ssoExchange } from '../controllers/ssoController.js';
import { protect } from '../middleware/auth.js';
import { validateLogin } from '../middleware/validate.js';

const router = express.Router();

router.post('/login', validateLogin, login);
router.post('/logout', protect, logout);
router.post('/heartbeat', protect, heartbeat);
router.get('/me', protect, getMe);

// Phase 5 Pilot: Central Portal Single Sign-On (SSO) ticket exchange
router.post('/sso/exchange', ssoExchange);

export default router;
