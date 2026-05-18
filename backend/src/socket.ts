import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface SessionData {
  kioskSocketId: string;
  mobileSocketId?: string;
  createdAt: number;
}

// Store active sessions: sessionId -> SessionData
const sessions = new Map<string, SessionData>();

export const setupSocketIO = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ---- KIOSK EVENTS ----
    socket.on('kiosk:register', () => {
      // Clean up any existing session for this kiosk
      for (const [existingSessionId, session] of sessions.entries()) {
        if (session.kioskSocketId === socket.id) {
          if (session.mobileSocketId) {
             io.to(session.mobileSocketId).emit('session:terminated');
          }
          sessions.delete(existingSessionId);
        }
      }

      // Generate a new unique session ID for this kiosk
      const sessionId = uuidv4();
      
      sessions.set(sessionId, {
        kioskSocketId: socket.id,
        createdAt: Date.now()
      });

      socket.join(sessionId); // Kiosk joins the room
      
      console.log(`Kiosk registered. Session ID: ${sessionId}`);
      socket.emit('kiosk:session_created', { sessionId });
    });

    // ---- MOBILE EVENTS ----
    socket.on('mobile:join_session', ({ sessionId }) => {
      console.log(`Mobile attempting to join session: ${sessionId}`);
      const session = sessions.get(sessionId);

      if (session) {
        session.mobileSocketId = socket.id;
        socket.join(sessionId);
        
        console.log(`Mobile joined session: ${sessionId}`);
        
        // Notify both parties
        socket.emit('mobile:joined', { success: true });
        io.to(session.kioskSocketId).emit('kiosk:mobile_connected');
      } else {
        socket.emit('mobile:joined', { success: false, error: 'Session not found or expired' });
      }
    });

    socket.on('mobile:payment_started', ({ sessionId }) => {
      const session = sessions.get(sessionId);
      if (session) {
        io.to(session.kioskSocketId).emit('kiosk:payment_started');
      }
    });

    socket.on('mobile:payment_failed', ({ sessionId }) => {
      const session = sessions.get(sessionId);
      if (session) {
        io.to(session.kioskSocketId).emit('kiosk:payment_failed');
      }
    });

    // Sync Preview State to Kiosk
    socket.on('mobile:sync_preview', ({ sessionId, showPreview, fileUrl, pageNumber, orientation }) => {
      const session = sessions.get(sessionId);
      if (session) {
        io.to(session.kioskSocketId).emit('kiosk:sync_preview', { showPreview, fileUrl, pageNumber, orientation });
      }
    });

    socket.on('mobile:trigger_print', ({ sessionId, files }) => {
      console.log(`Print triggered for session ${sessionId} with ${files.length} files`);
      const session = sessions.get(sessionId);
      if (session) {
        // Send batch print command to the kiosk daemon
        io.to(session.kioskSocketId).emit('kiosk:print_command', {
          files
        });
      }
    });

    // ---- DISCONNECT EVENTS ----
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Find if this was a kiosk or mobile and clean up
      for (const [sessionId, session] of sessions.entries()) {
        if (session.kioskSocketId === socket.id) {
          // Kiosk disconnected
          console.log(`Kiosk disconnected, terminating session ${sessionId}`);
          io.to(sessionId).emit('session:terminated');
          sessions.delete(sessionId);
          break;
        } else if (session.mobileSocketId === socket.id) {
          // Mobile disconnected
          console.log(`Mobile disconnected from session ${sessionId}`);
          io.to(session.kioskSocketId).emit('kiosk:mobile_disconnected');
          session.mobileSocketId = undefined;
          break;
        }
      }
    });
  });
};
