import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { print } from 'pdf-to-printer';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const tempDir = path.join(os.tmpdir(), 'nexusprint-daemon');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Get the backend URL (default to localhost since the daemon runs on the same PC as the backend for now)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

app.post('/print', async (req, res) => {
  try {
    const { files } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Missing files array' });
    }

    console.log(`[Daemon] Received batch print command for ${files.length} files`);

    for (let i = 0; i < files.length; i++) {
      const { fileUrl, settings } = files[i];
      console.log(`[Daemon] Processing file ${i+1}/${files.length}: ${fileUrl}`);

      // 1. Download the file from the Backend Server
      const fullUrl = `${BACKEND_URL}${fileUrl}`;
      const localFilePath = path.join(tempDir, `${uuidv4()}.pdf`);
      
      const response = await axios({
        method: 'GET',
        url: fullUrl,
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(localFilePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`[Daemon] Downloaded to ${localFilePath}`);

      // 2. Execute Physical Print Command
      let printOptions: any = {
        copies: settings?.copies || 1,
        orientation: settings?.orientation === 'landscape' ? 'landscape' : 'portrait',
        monochrome: settings?.colorMode === 'bw',
      };
      
      if (settings?.pageRange && settings.pageRange.trim() !== '') {
        printOptions.pages = settings.pageRange.trim();
      }
      
      const isColor = settings?.colorMode !== 'bw';
      const psCommand = `$printer = (Get-WmiObject -Query 'SELECT * FROM Win32_Printer WHERE Default=$true').Name; Set-PrintConfiguration -PrinterName $printer -Color $${isColor ? 'true' : 'false'};`;
      
      console.log(`[Daemon] Configuring physical printer color mode to: ${isColor ? 'Color' : 'B&W'}`);
      
      await new Promise<void>((resolve) => {
        const { exec } = require('child_process');
        exec(`powershell -Command "${psCommand}"`, (err: any) => {
          if (err) {
            console.error('[Daemon] Warning: Failed to set printer color mode via PowerShell', err);
          }
          resolve();
        });
      });

      console.log(`[Daemon] Sending to physical printer...`, printOptions);
      await print(localFilePath, printOptions);
      console.log(`[Daemon] Print spooled successfully!`);

      // 3. Clean up the local temp file securely
      fs.unlinkSync(localFilePath);
      console.log(`[Daemon] Local temp file securely deleted.`);

      // 4. Tell Backend to securely delete the original file
      const filename = fileUrl.split('/').pop();
      if (filename) {
        try {
          await axios.delete(`${BACKEND_URL}/api/upload/cleanup/${filename}`);
          console.log(`[Daemon] Instructed backend to delete original file.`);
        } catch (err: any) {
          console.error(`[Daemon] Failed to delete original file on backend:`, err.message);
        }
      }
    }

    res.json({ success: true, message: 'All files printed and deleted securely' });
  } catch (error: any) {
    console.error(`[Daemon] Print Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`🖨️  Print Daemon is running on http://localhost:${PORT}`);
});
