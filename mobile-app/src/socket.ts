import { io, Socket } from 'socket.io-client';

// The backend URL is passed as a query parameter in the QR code URL
// so the mobile phone always knows where to connect, even through ngrok.
function getBackendUrl(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const backendUrl = params.get('backend');
    if (backendUrl) return decodeURIComponent(backendUrl);
  }
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
}

const BACKEND_URL = getBackendUrl();
console.log('[Socket] Connecting to backend:', BACKEND_URL);

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['polling', 'websocket'],
  // This header tells ngrok to skip the interstitial "Visit Site" page
  // Without it, socket.io handshake gets blocked by ngrok's browser warning
  extraHeaders: {
    'ngrok-skip-browser-warning': 'true',
  },
});

socket.on('connect', () => console.log('[Socket] Connected!'));
socket.on('connect_error', (err) => console.error('[Socket] Connection error:', err.message));

export { BACKEND_URL };
