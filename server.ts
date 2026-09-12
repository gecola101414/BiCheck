import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
app.use(express.json({ limit: "25mb" }));

const PORT = 3000;

interface EphemeralSessionInternal {
  id: string;
  receiverMessage: string;
  receiverCode: string;
  receiverCodeCreatedAt: number;
  receiverCodeExpiresAt: number;
  donorCode?: string;
  donorCodeCreatedAt?: number;
  donorCodeExpiresAt?: number;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  fileDataUrl?: string;
  status: 'pending_donor_upload' | 'pending_receiver_unlock' | 'unlocked' | 'revoked' | 'expired';
  unlockedAt?: number;
  unlockedExpiresAt?: number;
  createdAt: number;
}

let activeSessions: Map<string, EphemeralSessionInternal> = new Map();

function generate4DigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Automatic cleanup of expired sessions & zero persistence memory wipe
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (session.status === 'pending_donor_upload' && now > session.receiverCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
    } else if (session.status === 'pending_receiver_unlock' && session.donorCodeExpiresAt && now > session.donorCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
    } else if (session.status === 'unlocked' && session.unlockedExpiresAt && now > session.unlockedExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
    }
  }
}
setInterval(cleanupSessions, 4000);

// ==================== EPHEMERAL API ====================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", activeCount: activeSessions.size });
});

// Step 1: Receiver generates a customized request & 4-digit Receiver Code
app.post("/api/ephemeral/request", (req, res) => {
  const { message } = req.body;
  const receiverMessage = message?.trim() || "Ciao! Mi mandi il tuo documento per favore?";
  
  const now = Date.now();
  const receiverCode = generate4DigitCode();
  const sessionId = "tx_" + Math.random().toString(36).substring(2, 9);

  const session: EphemeralSessionInternal = {
    id: sessionId,
    receiverMessage,
    receiverCode,
    receiverCodeCreatedAt: now,
    receiverCodeExpiresAt: now + 300 * 1000, // 5 minutes
    status: "pending_donor_upload",
    createdAt: now
  };

  activeSessions.set(sessionId, session);

  res.json({ success: true, session });
});

// Step 2: Donor enters 4-digit Receiver Code & gets customized message
app.post("/api/ephemeral/donor-load-request", (req, res) => {
  const { receiverCode } = req.body;
  cleanupSessions();

  const codeStr = receiverCode ? receiverCode.toString().trim() : "";

  let targetSession: EphemeralSessionInternal | null = null;
  for (const session of activeSessions.values()) {
    if (
      session.receiverCode === codeStr && 
      (session.status === "pending_donor_upload" || session.status === "pending_receiver_unlock")
    ) {
      targetSession = session;
      break;
    }
  }

  if (!targetSession) {
    return res.status(404).json({ 
      error: "Codice ricevente invalido o scaduto. Ricontrolla le 4 cifre." 
    });
  }

  res.json({ success: true, session: targetSession });
});

// Step 3: Donor attaches file & generates 4-digit Donor Code
app.post("/api/ephemeral/donor-attach-file", (req, res) => {
  const { sessionId, fileName, fileSize, fileType, fileDataUrl } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session || (session.status !== "pending_donor_upload" && session.status !== "pending_receiver_unlock")) {
    return res.status(404).json({ error: "Sessione non valida o scaduta." });
  }

  const now = Date.now();
  const donorCode = generate4DigitCode();

  session.fileName = fileName || "documento.jpg";
  session.fileSize = fileSize || "1.2 MB";
  session.fileType = fileType || "image/jpeg";
  session.fileDataUrl = fileDataUrl;
  session.donorCode = donorCode;
  session.donorCodeCreatedAt = now;
  session.donorCodeExpiresAt = now + 300 * 1000; // 5 mins
  session.status = "pending_receiver_unlock";

  res.json({ success: true, session, donorCode });
});

// Step 4: Receiver inputs Donor Code to unlock file download (10 min window)
app.post("/api/ephemeral/receiver-unlock", (req, res) => {
  const { sessionId, donorCode } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Sessione non trovata." });
  }

  if (session.status === "unlocked") {
    return res.json({ success: true, session });
  }

  const codeStr = donorCode ? donorCode.toString().trim() : "";

  if (session.status !== "pending_receiver_unlock" || session.donorCode !== codeStr) {
    return res.status(400).json({ error: "Codice donatore errato o scaduto." });
  }

  const now = Date.now();
  session.status = "unlocked";
  session.unlockedAt = now;
  session.unlockedExpiresAt = now + 600 * 1000; // 10 minutes download window

  res.json({ success: true, session });
});

// Donor Kill Switch: Revoke connection immediately
app.post("/api/ephemeral/donor-revoke", (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = "revoked";
    delete session.fileDataUrl; // Instant memory wipe
  }
  res.json({ success: true });
});

// Poll session status
app.get("/api/ephemeral/status/:sessionId", (req, res) => {
  cleanupSessions();
  const session = activeSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Sessione non trovata" });
  }
  res.json({ success: true, session });
});

// ==================== VITE MIDDLEWARE ====================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server Minimal Ephemeral su http://0.0.0.0:${PORT}`);
  });
}

startServer();
