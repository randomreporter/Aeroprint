import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { print } from 'pdf-to-printer';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json());

const tempDir = path.join(os.tmpdir(), 'nexusprint-daemon');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Get the backend URL (default to localhost since the daemon runs on the same PC as the backend for now)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

// --- Cloud Dashboard Integration ---
const CLOUD_DASHBOARD_URL = process.env.CLOUD_DASHBOARD_URL || 'http://localhost:3001';
const KIOSK_KEY = process.env.KIOSK_KEY || ''; // Set in Electron settings
const SOFTWARE_VERSION = process.env.SOFTWARE_VERSION || '2.0.0';

// Track total pages printed this session
let sessionPaperCount = 0;

// --- Printer Status via PowerShell WMI ---
interface PrinterStatus {
  status: string;
  error: string | null;
  printerName: string | null;
}

function checkPrinterStatus(): Promise<PrinterStatus> {
  return new Promise((resolve) => {
    const psCommand = `
      $printer = Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=$true"
      if ($printer) {
        $status = switch ($printer.PrinterStatus) {
          1 { "OTHER" }
          2 { "UNKNOWN" }
          3 { "ONLINE" }  # Idle
          4 { "PRINTING" }
          5 { "WARMUP" }
          6 { "STOPPED" }
          7 { "OFFLINE" }
          default { "UNKNOWN" }
        }
        $error = $null
        if ($printer.DetectedErrorState -eq 8) { $error = "PAPER_JAM" }
        elseif ($printer.DetectedErrorState -eq 5) { $error = "OUT_OF_PAPER" }
        elseif ($printer.DetectedErrorState -eq 6) { $error = "OUT_OF_TONER" }
        elseif ($printer.DetectedErrorState -eq 9) { $error = "OUTPUT_BIN_FULL" }
        elseif ($printer.DetectedErrorState -eq 11) { $error = "OFFLINE" }
        Write-Output "$($printer.Name)|$status|$error"
      } else {
        Write-Output "NO_PRINTER|OFFLINE|NO_PRINTER_FOUND"
      }
    `;

    exec(`powershell -NoProfile -Command "${psCommand.replace(/\n/g, ' ')}"`, (err, stdout) => {
      if (err) {
        console.error('[Daemon] WMI printer check failed:', err.message);
        resolve({ status: 'UNKNOWN', error: null, printerName: null });
        return;
      }

      const parts = stdout.trim().split('|');
      resolve({
        printerName: parts[0] || null,
        status: parts[1] || 'UNKNOWN',
        error: parts[2] === 'null' || parts[2] === '' ? null : (parts[2] || null),
      });
    });
  });
}

// --- Cloud Heartbeat ---
// Sends a status update to the Cloud Dashboard every 30 seconds
async function sendHeartbeat() {
  if (!KIOSK_KEY) return; // Skip if no kiosk key configured

  try {
    const printerStatus = await checkPrinterStatus();

    // Map printer status to kiosk status
    let kioskStatus = 'ONLINE';
    if (printerStatus.error) {
      kioskStatus = 'ERROR';
    } else if (printerStatus.status === 'PRINTING') {
      kioskStatus = 'PRINTING';
    } else if (printerStatus.status === 'OFFLINE' || printerStatus.status === 'STOPPED') {
      kioskStatus = 'ERROR';
    }

    const payload = {
      kioskKey: KIOSK_KEY,
      status: kioskStatus,
      paperCount: sessionPaperCount,
      softwareVersion: SOFTWARE_VERSION,
      currentError: printerStatus.error,
    };

    await fetch(`${CLOUD_DASHBOARD_URL}/api/kiosk/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Only log errors (less noise)
    if (printerStatus.error) {
      console.log(`[Daemon] Heartbeat sent — Status: ${kioskStatus}, Error: ${printerStatus.error}`);
    }
  } catch (err: any) {
    console.error('[Daemon] Heartbeat failed:', err.message);
  }
}

// Start heartbeat interval (every 30 seconds)
setInterval(sendHeartbeat, 30000);
// Send initial heartbeat on startup
setTimeout(sendHeartbeat, 5000);

// --- Report Print Result to Cloud ---
async function reportPrintResult(paymentId: string, status: string, failureReason: string | null, pageCount: number) {
  if (!KIOSK_KEY) return;

  try {
    await fetch(`${CLOUD_DASHBOARD_URL}/api/kiosk/print-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kioskKey: KIOSK_KEY,
        paymentId,
        status,
        failureReason,
        pageCount,
      }),
    });
    console.log(`[Daemon] Print result reported to cloud — ${status}`);
  } catch (err: any) {
    console.error('[Daemon] Failed to report print result:', err.message);
  }
}

// --- Printer Status Check Endpoint ---
// Called by the mobile app before payment to verify the printer is ready
app.get('/printer-status', async (req, res) => {
  const status = await checkPrinterStatus();
  res.json({
    ready: status.status === 'ONLINE' || status.status === 'PRINTING',
    ...status,
  });
});

// --- Main Print Endpoint ---
app.post('/print', async (req, res) => {
  try {
    const { files, paymentId } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Missing files array' });
    }

    // Pre-flight: Check printer status before printing
    const printerCheck = await checkPrinterStatus();
    if (printerCheck.error) {
      console.error(`[Daemon] Printer has error BEFORE print: ${printerCheck.error}`);

      // Report failure to cloud
      const totalPages = files.reduce((sum: number, f: any) => sum + (f.settings?.numPages || 1), 0);
      await reportPrintResult(paymentId || 'unknown', 'FAILED', printerCheck.error, totalPages);

      return res.status(503).json({
        error: `Printer error: ${printerCheck.error}`,
        printerError: printerCheck.error,
        refundTriggered: true,
      });
    }

    console.log(`[Daemon] Received batch print command for ${files.length} files`);
    let totalPagesPrinted = 0;

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

      const pagesPrinted = settings?.numPages || 1;
      totalPagesPrinted += pagesPrinted * (settings?.copies || 1);

      // 3. Post-print: Check if printer errored during the job
      const postPrintStatus = await checkPrinterStatus();
      if (postPrintStatus.error) {
        console.error(`[Daemon] Printer errored DURING print: ${postPrintStatus.error}`);
        await reportPrintResult(paymentId || 'unknown', 'FAILED', postPrintStatus.error, totalPagesPrinted);

        // Clean up
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

        return res.status(500).json({
          error: `Printer error during printing: ${postPrintStatus.error}`,
          printerError: postPrintStatus.error,
          refundTriggered: true,
          pagesPrintedBeforeError: totalPagesPrinted,
        });
      }

      // 4. Clean up the local temp file securely
      fs.unlinkSync(localFilePath);
      console.log(`[Daemon] Local temp file securely deleted.`);

      // 5. Tell Backend to securely delete the original file
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

    // Update session paper count
    sessionPaperCount += totalPagesPrinted;

    // Report success to cloud
    await reportPrintResult(paymentId || 'unknown', 'COMPLETED', null, totalPagesPrinted);

    res.json({ success: true, message: 'All files printed and deleted securely', totalPagesPrinted });
  } catch (error: any) {
    console.error(`[Daemon] Print Error:`, error.message);

    // Report failure to cloud
    await reportPrintResult(req.body?.paymentId || 'unknown', 'FAILED', 'SPOOLER_ERROR', 0);

    res.status(500).json({ error: error.message, refundTriggered: true });
  }
});

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`🖨️  Print Daemon v${SOFTWARE_VERSION} is running on http://localhost:${PORT}`);
  if (KIOSK_KEY) {
    console.log(`📡 Cloud telemetry enabled. KioskKey: ${KIOSK_KEY}`);
    console.log(`☁️  Cloud Dashboard: ${CLOUD_DASHBOARD_URL}`);
  } else {
    console.log('⚠️  No KIOSK_KEY configured — cloud telemetry disabled.');
  }
});
