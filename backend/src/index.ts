import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import path from 'path';
import uploadRoutes from './routes/upload';
import { setupSocketIO } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Enable CORS for frontend applications
app.use(cors({ origin: '*' }));
app.use(express.json());

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Setup Socket logic
setupSocketIO(io);

// Serve static frontend builds (for Electron / production mode)
const kioskDistPath = process.env.KIOSK_DIST_PATH || path.join(__dirname, '../../kiosk-app/dist');
const mobileDistPath = process.env.MOBILE_DIST_PATH || path.join(__dirname, '../../mobile-app/dist');

app.use('/kiosk', express.static(kioskDistPath));
app.use('/mobile', express.static(mobileDistPath));

// SPA fallback for kiosk
app.get('/kiosk/{*splat}', (req, res) => {
  res.sendFile(path.join(kioskDistPath, 'index.html'));
});

// SPA fallback for mobile
app.get('/mobile/{*splat}', (req, res) => {
  res.sendFile(path.join(mobileDistPath, 'index.html'));
});

// Routes
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Print Kiosk Backend is running' });
});

// --- Cloud Dashboard URL ---
// The kiosk will query this to fetch pricing/revenue split info for Razorpay Route
const CLOUD_DASHBOARD_URL = process.env.CLOUD_DASHBOARD_URL || 'http://localhost:3001';

// --- Razorpay Order Creation (Proxied to Cloud Dashboard) ---
app.post('/api/payments/create-order', async (req, res) => {
  try {
    const { files, kioskKey } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const kioskKeyToUse = kioskKey || process.env.KIOSK_KEY || 'unknown';

    // Proxy the order creation to the cloud dashboard
    console.log(`[Backend] Proxying create-order to Cloud Dashboard: ${CLOUD_DASHBOARD_URL}`);
    const cloudRes = await fetch(`${CLOUD_DASHBOARD_URL}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, kioskKey: kioskKeyToUse }),
    });

    const cloudData = await cloudRes.json();
    if (!cloudRes.ok) {
      return res.status(cloudRes.status).json({ success: false, error: cloudData.error || 'Cloud order creation failed' });
    }

    res.json(cloudData);
  } catch (error: any) {
    console.error('Razorpay Order Proxy Error:', error);
    res.status(500).json({ success: false, error: 'Payment initialization failed' });
  }
});

// --- Razorpay Refund Endpoint (Proxied to Cloud Dashboard) ---
app.post('/api/payments/refund', async (req, res) => {
  try {
    const { paymentId, amount } = req.body;
    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'paymentId is required' });
    }

    // Proxy the refund request to the cloud dashboard
    console.log(`[Backend] Proxying refund to Cloud Dashboard: ${CLOUD_DASHBOARD_URL}`);
    const cloudRes = await fetch(`${CLOUD_DASHBOARD_URL}/api/payments/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, amount }),
    });

    const cloudData = await cloudRes.json();
    if (!cloudRes.ok) {
      return res.status(cloudRes.status).json({ success: false, error: cloudData.error || 'Cloud refund failed' });
    }

    res.json(cloudData);
  } catch (error: any) {
    console.error('Refund Proxy Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Refund failed' });
  }
});

const PORT = process.env.PORT || 4000;

export function startServer(): Promise<number> {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`Backend server is running on http://localhost:${PORT}`);
      resolve(Number(PORT));
    });
  });
}

startServer();

