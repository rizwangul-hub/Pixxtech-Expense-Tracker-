import express from 'express';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/imageUpload.js';
import { uploadImages } from '../controllers/uploadController.js';

const router = express.Router();

router.use(protect);
router.post('/images', upload.array('images', 10), uploadImages);

export default router;
