import express from 'express';
import { collectRent, getPlazaUnits } from '../controllers/rentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/collect', collectRent);
router.get('/plaza-units/:propertyId', getPlazaUnits);

export default router;
