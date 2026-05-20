# Aeroprint Kiosk System

Aeroprint is a highly secure, zero-touch, self-hosted printing kiosk application. It allows users to scan a QR code on a kiosk screen, upload documents securely from their mobile devices, pay via Razorpay, and print instantly—all without needing USB drives or logins.

## 🚀 Key Features

- **Zero-Touch Experience:** Users interact entirely through their mobile devices after scanning the kiosk's QR code.
- **End-to-End Encrypted Session:** Secure Socket.IO rooms ensure the kiosk and the mobile device communicate privately.
- **Cloudflare Tunnels Built-in:** `cloudflared` is bundled directly into the application, securely tunneling the local backend to a custom public domain (e.g., `aeroprint.yourdomain.com`) without manual setup.
- **Advanced Print Options & Live Pricing:** 
  - Dynamic page range selection (e.g., `1-3, 5`).
  - Total order cap of 15 pages to prevent abuse/paper jams.
  - Live preview of total price (Color = ₹15, B&W = ₹5) on the mobile web app.
- **Android Grace Period Fix:** Includes a specialized 60-second WebSocket grace period to handle aggressive backgrounding on Android phones (like Moto G) when opening the system file picker.
- **Over-The-Air (OTA) Updates:** Powered by `electron-updater`, the kiosk checks GitHub for new releases at startup and at 3:00 AM daily, silently downloading and applying updates without disrupting operations.

## 🏗️ Architecture

The system is a monorepo consisting of 4 integrated layers running entirely within a single Electron wrapper:

1. **Backend Server (Port 4000):** An Express & Socket.IO Node.js server. Serves as the central brain. It handles file uploads, Razorpay order creation, and orchestrates the WebSocket rooms between the kiosk and mobile. It serves the static assets for both the Kiosk and Mobile frontends.
2. **Kiosk Frontend (React/Vite):** A React SPA that runs full-screen within Electron. Displays the QR Code, connection status, and acts as the receiver for print commands.
3. **Mobile Frontend (React/Vite):** A React SPA accessed by the user's phone via the Cloudflare Tunnel URL. Handles file selection, print settings, live pricing, and the Razorpay checkout overlay.
4. **Print Daemon (Port 4001):** A separate Express server running on the kiosk machine that interfaces directly with the Windows Spooler via `pdf-to-printer` and PowerShell to spool jobs and enforce color/B&W hardware settings.

## 🛠️ Tech Stack
- **Desktop Wrapper:** Electron & Electron-Builder
- **Frontends:** React, Vite, TailwindCSS (Emerald & Teal Theme), Lucide Icons, React-PDF
- **Backend:** Node.js, Express, Socket.IO, node-cron
- **Printing:** `pdf-to-printer` (SumatraPDF)
- **Payments:** Razorpay API
- **Networking:** Cloudflare Tunnels (`cloudflared.exe`)

## ⚙️ How to Develop

To run the project in development mode:

1. **Install Dependencies:**
   ```bash
   npm install
   cd backend && npm install
   cd ../daemon && npm install
   cd ../kiosk-app && npm install
   cd ../mobile-app && npm install
   ```

2. **Run Dev Servers (Terminal 1):**
   ```bash
   npm run dev
   ```
   *This starts the Kiosk Vite server, Mobile Vite server, Backend Server, and Print Daemon concurrently.*

3. **Launch Electron (Terminal 2):**
   ```bash
   npm start
   ```

## 📦 How to Release an Update

Since the kiosk updates itself automatically via GitHub, here is the exact workflow to push a new feature to the physical machines:

1. Make your code changes and commit them.
2. **Build the Installer:**
   ```bash
   npm run dist
   ```
3. Open your GitHub Repository in the browser and navigate to **Releases -> Draft a new release**.
4. Create a new tag (e.g., `v1.0.3`).
5. Drag and drop the following two files from your local `dist-electron` folder into the release assets:
   - `Aeroprint Setup X.X.X.exe`
   - `latest.yml`
6. Click **Publish Release**.
7. The physical kiosks will detect the new release at 3:00 AM (or on next restart), download it silently in the background, and install it instantly the next time the app closes.
