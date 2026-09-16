import { Readable } from 'stream';
import cloudinary, { configureCloudinary } from '../config/cloudinary.js';

const uploadBuffer = (file) =>
  new Promise((resolve, reject) => {
    if (!configureCloudinary()) {
      reject(new Error('Cloudinary is not configured on the backend.'));
      return;
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'pixx-expense-tracker/evidence',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve({
          url: result.secure_url,
          publicId: result.public_id,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        });
      }
    );
    Readable.from(file.buffer).pipe(stream);
  });

export const uploadImages = async (req, res) => {
  if (!req.files?.length) {
    return res.status(400).json({ success: false, message: 'Select at least one image to upload.' });
  }

  try {
    const images = await Promise.all(req.files.map(uploadBuffer));
    return res.status(201).json({ success: true, images });
  } catch (error) {
    console.error('Image upload error:', error);
    return res.status(502).json({ success: false, message: error.message || 'Failed to upload images.' });
  }
};
