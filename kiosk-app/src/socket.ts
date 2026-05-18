import { io } from 'socket.io-client';

// In production, this will point to the deployed backend.
// For local development, it points to the local node server.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export const socket = io(BACKEND_URL, {
  autoConnect: true,
});
