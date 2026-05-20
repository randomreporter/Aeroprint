import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import os from 'os';

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
    // Allow PDF, Word, and common image formats
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images (PNG, JPG) are allowed.'));
    }
  }
});

// Helper: Convert Word to PDF using MS Word COM object via PowerShell
function convertWordToPdf(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const absoluteInputPath = path.resolve(inputPath);
    const absoluteOutputPath = path.resolve(outputPath);
    const tempScriptPath = path.join(os.tmpdir(), `ap-convert-${uuidv4()}.ps1`);

    const psScriptContent = `
$ErrorActionPreference = 'Stop'
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open("${absoluteInputPath.replace(/"/g, '`"')}")
  $doc.ExportAsFixedFormat("${absoluteOutputPath.replace(/"/g, '`"')}", 17, $false, 0, 0, 1, 1, 0, $true, $true, 0, $true, $true, $false)
  $doc.Close()
  $word.Quit()
  Write-Output "SUCCESS"
} catch {
  if ($word) {
    try { $word.Quit() } catch {}
  }
  Write-Error $_.Exception.Message
  exit 1
}
`;

    fs.writeFileSync(tempScriptPath, psScriptContent, 'utf8');

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, (err, stdout, stderr) => {
      try {
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
      } catch (unlinkErr) {
        console.error('[Converter] Failed to delete temp PS1 script:', unlinkErr);
      }

      if (err) {
        console.error('[Converter] Word to PDF failed:', err, stderr);
        reject(new Error(stderr || err.message));
      } else if (stdout.includes('SUCCESS') || fs.existsSync(absoluteOutputPath)) {
        console.log('[Converter] Word to PDF completed successfully.');
        resolve();
      } else {
        reject(new Error('Conversion finished but PDF was not created.'));
      }
    });
  });
}

// Helper: Convert Image to PDF using pdf-lib (fit to A4 if larger, as-is centered if smaller, without stretching)
async function convertImageToPdf(inputPath: string, outputPath: string): Promise<void> {
  const imageBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.create();
  
  // A4 dimensions in points (72 points per inch)
  const A4_WIDTH = 595.27;
  const A4_HEIGHT = 841.89;

  let img;
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.png') {
    img = await pdfDoc.embedPng(imageBytes);
  } else if (ext === '.jpg' || ext === '.jpeg') {
    img = await pdfDoc.embedJpg(imageBytes);
  } else {
    throw new Error('Unsupported image format.');
  }

  const { width, height } = img.scale(1);

  let targetWidth = width;
  let targetHeight = height;

  // By default A4 is portrait
  let pageWidth = A4_WIDTH;
  let pageHeight = A4_HEIGHT;

  // If the image is landscape, make the PDF page landscape
  if (width > height) {
    pageWidth = A4_HEIGHT;
    pageHeight = A4_WIDTH;
  }

  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  if (width > pageWidth || height > pageHeight) {
    const widthRatio = pageWidth / width;
    const heightRatio = pageHeight / height;
    const ratio = Math.min(widthRatio, heightRatio);
    targetWidth = width * ratio;
    targetHeight = height * ratio;
  }

  // Center the image on the page
  const x = (pageWidth - targetWidth) / 2;
  const y = (pageHeight - targetHeight) / 2;

  page.drawImage(img, {
    x,
    y,
    width: targetWidth,
    height: targetHeight
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

// Upload Endpoint
router.post('/', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const sessionId = req.body.sessionId;
    if (!sessionId) {
       return res.status(400).json({ error: 'Session ID is required' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let filePath = path.join(uploadDir, req.file.filename);
    let outputFilename = req.file.filename;
    let isConverted = false;

    // Convert Word or Image files to PDF
    if (ext !== '.pdf') {
      const pdfFilename = `${uuidv4()}.pdf`;
      const pdfPath = path.join(uploadDir, pdfFilename);

      if (ext === '.docx' || ext === '.doc') {
        console.log(`[Upload] Converting Word document to PDF: ${req.file.filename}`);
        await convertWordToPdf(filePath, pdfPath);
        isConverted = true;
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        console.log(`[Upload] Converting Image to PDF: ${req.file.filename}`);
        await convertImageToPdf(filePath, pdfPath);
        isConverted = true;
      }

      if (isConverted) {
        // Delete original non-PDF file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        filePath = pdfPath;
        outputFilename = pdfFilename;
      }
    }

    // Parse page count using pdf-lib
    let numPages = 1;
    try {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      numPages = pdfDoc.getPageCount();
    } catch (pdfErr) {
      console.error('[Upload] Failed to parse PDF page count with pdf-lib, falling back to 1:', pdfErr);
    }

    const fileUrl = `/api/upload/download/${outputFilename}`;

    // Auto-cleanup: Delete file automatically after 15 minutes if not printed
    const fileToDeletePath = filePath;
    const filenameToDelete = outputFilename;
    setTimeout(() => {
      if (fs.existsSync(fileToDeletePath)) {
        fs.unlinkSync(fileToDeletePath);
        console.log(`[Auto-Cleanup] Deleted orphaned file: ${filenameToDelete}`);
      }
    }, 15 * 60 * 1000);

    res.json({
      success: true,
      fileUrl,
      originalName: req.file.originalname,
      size: req.file.size,
      numPages
    });

  } catch (error: any) {
    console.error('[Upload] Error processing upload:', error);
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
