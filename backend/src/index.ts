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

// Razorpay Order Creation
app.post('/api/payments/create-order', async (req, res) => {
  try {
    const { files } = req.body; // Expecting an array of settings: { copies, colorMode }
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    // Calculate total amount across all files
    let totalAmountInPaise = 0;
    for (const f of files) {
      const pricePerSheet = f.colorMode === 'color' ? 15 : 5;
      const numSheets = f.numPages || 1;
      const copies = f.copies || 1;
      totalAmountInPaise += (pricePerSheet * numSheets * copies) * 100;
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const options = {
      amount: totalAmountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };

    const order = await instance.orders.create(options);
    res.json({ success: true, orderId: order.id, amount: totalAmountInPaise, key: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Razorpay Error:', error);
    res.status(500).json({ success: false, error: 'Payment initialization failed' });
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
