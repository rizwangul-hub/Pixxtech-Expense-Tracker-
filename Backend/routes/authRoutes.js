import express from 'express';
import { login, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateLogin } from '../middleware/validate.js';

const router = express.Router();

router.post('/login', validateLogin, login);
router.get('/me', protect, getMe);

export default router;
