import multer from 'multer';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('Only JPG, PNG, WEBP, and GIF image files are allowed.'));
    }
    callback(null, true);
  },
});

export default upload;
