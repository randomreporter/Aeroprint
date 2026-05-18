import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Ensure uploads directory exists — use env var in production (writable location)
const uploadDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Setup Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent collisions
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Only allow PDF and Word for now
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/msword' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed.'));
    }
  }
});

// Upload Endpoint
router.post('/', upload.single('document'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const sessionId = req.body.sessionId;
    if (!sessionId) {
       return res.status(400).json({ error: 'Session ID is required' });
    }

    const fileUrl = `/api/upload/download/${req.file.filename}`;
    const filePath = path.join(uploadDir, req.file.filename);

    // Auto-cleanup: Delete file automatically after 15 minutes if not printed
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Auto-Cleanup] Deleted orphaned file: ${req.file?.filename}`);
      }
    }, 15 * 60 * 1000);

    res.json({
      success: true,
      fileUrl,
      originalName: req.file.originalname,
      size: req.file.size
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download/Fetch File Endpoint
router.get('/download/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Secure Cleanup Endpoint
router.delete('/cleanup/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[Secure-Cleanup] Deleted printed file: ${req.params.filename}`);
    res.json({ success: true, message: 'File securely deleted' });
  } else {
    res.status(404).json({ error: 'File not found or already deleted' });
  }
});

export default router;
