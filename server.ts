import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();

// Set 500 MB payload limit for E2EE encrypted real files
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

const PORT = 3000;
const STORE_FILE = path.join(process.cwd(), ".sessions_store.json");
const BLOBS_DIR = path.join(process.cwd(), ".file_blobs");

if (!fs.existsSync(BLOBS_DIR)) {
  try {
    fs.mkdirSync(BLOBS_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

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
  fileUrl?: string;
  isEncrypted?: boolean;
  status: 'pending_donor_upload' | 'pending_receiver_unlock' | 'unlocked' | 'purged' | 'revoked' | 'expired';
  unlockedAt?: number;
  unlockedExpiresAt?: number;
  purgedAt?: number;
  createdAt: number;
}

let activeSessions: Map<string, EphemeralSessionInternal> = new Map();
const fileMemoryStore: Map<string, string> = new Map();

// Save file data blob to disk & memory
function saveFileBlob(sessionId: string, dataUrl: string) {
  fileMemoryStore.set(sessionId, dataUrl);
  try {
    const filePath = path.join(BLOBS_DIR, `${sessionId}.dat`);
    fs.writeFileSync(filePath, dataUrl, "utf-8");
  } catch (err) {
    console.error("Error writing file blob to disk:", err);
  }
}

// Get file blob from memory or disk
function getFileBlob(sessionId: string): string | null {
  if (fileMemoryStore.has(sessionId)) {
    return fileMemoryStore.get(sessionId) || null;
  }
  try {
    const filePath = path.join(BLOBS_DIR, `${sessionId}.dat`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      fileMemoryStore.set(sessionId, data);
      return data;
    }
  } catch (err) {
    console.error("Error reading file blob from disk:", err);
  }
  return null;
}

// Instant Purge: Delete file blob permanently from memory & disk
function purgeFileBlob(sessionId: string) {
  fileMemoryStore.delete(sessionId);
  try {
    const filePath = path.join(BLOBS_DIR, `${sessionId}.dat`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[SERVER PURGE] File blob ${sessionId}.dat permanently deleted from disk.`);
    }
  } catch (err) {
    // ignore
  }
}

// File persistence helpers
function loadSessionsFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, "utf-8");
      const obj = JSON.parse(data);
      if (Array.isArray(obj)) {
        activeSessions = new Map(obj);
      }
    }
  } catch (err) {
    console.error("Error reading sessions from disk:", err);
  }
}

function saveSessionsToDisk() {
  try {
    const entries = Array.from(activeSessions.entries()).map(([id, session]) => {
      const clone = { ...session };
      if (clone.fileDataUrl && clone.fileDataUrl.length > 300000) {
        saveFileBlob(id, clone.fileDataUrl);
        delete clone.fileDataUrl;
      }
      return [id, clone] as [string, EphemeralSessionInternal];
    });
    fs.writeFileSync(STORE_FILE, JSON.stringify(entries), "utf-8");
  } catch (err) {
    console.error("Error saving sessions to disk:", err);
  }
}

// Initial load
loadSessionsFromDisk();

function generate4DigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Automatic cleanup of expired sessions (Max 1 hour lifespan rule)
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 Hour (60 minutes)

function cleanupSessions() {
  const now = Date.now();
  let changed = false;

  for (const [id, session] of activeSessions.entries()) {
    // Rule 1: Hard 1-Hour Auto-Destruction limit from session creation
    const isExceededOneHour = (now - session.createdAt) > ONE_HOUR_MS;

    if (session.status !== 'purged' && session.status !== 'expired' && isExceededOneHour) {
      session.status = 'expired';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
      console.log(`[GECOLASHARE AUTO-CLEANUP] Session ${id} exceeded 1 hour limit without download. File auto-destroyed & purged permanently.`);
    } 
    // Rule 2: Receiver Code expired without upload
    else if (session.status === 'pending_donor_upload' && now > session.receiverCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
    } 
    // Rule 3: Donor Code expired without unlock
    else if (session.status === 'pending_receiver_unlock' && session.donorCodeExpiresAt && now > session.donorCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
    } 
    // Rule 4: Unlocked status expired without download confirmation
    else if (session.status === 'unlocked' && session.unlockedExpiresAt && now > session.unlockedExpiresAt) {
      session.status = 'purged';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
    }
  }

  if (changed) {
    saveSessionsToDisk();
  }
}

setInterval(cleanupSessions, 5000);

// ==================== GECOLASHARE EPHEMERAL API ====================

app.get("/api/health", (req, res) => {
  cleanupSessions();
  res.json({ status: "ok", appName: "GecolaShare", version: "2026@AETERNA", activeCount: activeSessions.size });
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
    receiverCodeExpiresAt: now + 15 * 60 * 1000, // 15 minutes validity
    status: "pending_donor_upload",
    createdAt: now
  };

  activeSessions.set(sessionId, session);
  saveSessionsToDisk();

  console.log(`[GECOLASHARE] Receiver Code generated: ${receiverCode} (Session: ${sessionId})`);
  res.json({ success: true, session });
});

// Step 2: Donor enters 4-digit Receiver Code & gets customized message
app.post("/api/ephemeral/donor-load-request", (req, res) => {
  const { receiverCode } = req.body;
  cleanupSessions();

  const codeStr = receiverCode ? receiverCode.toString().replace(/\D/g, "") : "";

  if (!codeStr || codeStr.length !== 4) {
    return res.status(400).json({ error: "Inserisci un codice ricevente di 4 cifre." });
  }

  const matches = Array.from(activeSessions.values())
    .filter(s => s.receiverCode === codeStr && s.status !== "revoked" && s.status !== "expired" && s.status !== "purged")
    .sort((a, b) => b.createdAt - a.createdAt);

  if (matches.length === 0) {
    return res.status(404).json({ 
      error: "Codice ricevente invalido o scaduto. Ricontrolla le 4 cifre." 
    });
  }

  const targetSession = matches[0];
  res.json({ success: true, session: targetSession });
});

// Step 3: Donor attaches E2EE Encrypted file & generates 4-digit Donor Code
app.post("/api/ephemeral/donor-attach-file", (req, res) => {
  const { sessionId, fileName, fileSize, fileType, fileDataUrl, isEncrypted } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session || session.status === "revoked" || session.status === "expired" || session.status === "purged") {
    return res.status(404).json({ error: "Sessione non valida, revocata o già cancellata." });
  }

  const now = Date.now();
  const donorCode = generate4DigitCode();

  session.fileName = fileName || "documento.pdf";
  session.fileSize = fileSize || "1.2 MB";
  session.fileType = fileType || "application/pdf";
  session.isEncrypted = !!isEncrypted;
  
  if (fileDataUrl) {
    saveFileBlob(sessionId, fileDataUrl);
    session.fileUrl = `/api/ephemeral/download/${sessionId}`;
    if (fileDataUrl.length < 300000) {
      session.fileDataUrl = fileDataUrl;
    } else {
      delete session.fileDataUrl;
    }
  }

  session.donorCode = donorCode;
  session.donorCodeCreatedAt = now;
  session.donorCodeExpiresAt = now + 15 * 60 * 1000;
  session.status = "pending_receiver_unlock";

  saveSessionsToDisk();
  console.log(`[GECOLASHARE] E2EE Encrypted file attached for ${sessionId}. Donor Code: ${donorCode}`);
  res.json({ success: true, session, donorCode });
});

// Step 4: Receiver inputs Donor Code to unlock file download
app.post("/api/ephemeral/receiver-unlock", (req, res) => {
  const { sessionId, donorCode } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session || session.status === "purged") {
    return res.status(404).json({ error: "Sessione non trovata o file già auto-distrutto." });
  }

  const codeStr = donorCode ? donorCode.toString().replace(/\D/g, "") : "";

  if (session.status === "unlocked") {
    return res.json({ success: true, session });
  }

  if (session.status !== "pending_receiver_unlock" || session.donorCode !== codeStr) {
    return res.status(400).json({ error: "Codice donatore errato o scaduto." });
  }

  const now = Date.now();
  session.status = "unlocked";
  session.unlockedAt = now;
  session.unlockedExpiresAt = now + 30 * 60 * 1000;

  saveSessionsToDisk();
  console.log(`[GECOLASHARE] File unlocked for ${sessionId}`);
  res.json({ success: true, session });
});

// Dedicated File Stream Endpoint (Serves encrypted file payload for decryption)
app.get("/api/ephemeral/download/:sessionId", (req, res) => {
  cleanupSessions();
  const session = activeSessions.get(req.params.sessionId);
  if (!session || session.status === "revoked" || session.status === "expired" || session.status === "purged") {
    return res.status(404).send("File non disponibile: auto-distrutto, revocato o scaduto.");
  }

  const fileData = session.fileDataUrl || getFileBlob(req.params.sessionId);
  if (!fileData) {
    return res.status(404).send("File non trovato sul server.");
  }

  res.setHeader("Content-Type", "text/plain");
  res.send(fileData);
});

// Explicit Post-Download Confirmation: Wipes file permanently AFTER client download completes
app.post("/api/ephemeral/confirm-purge", (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (session && session.status !== "purged") {
    session.status = "purged";
    session.purgedAt = Date.now();
    delete session.fileDataUrl;
    delete session.fileUrl;
    purgeFileBlob(sessionId);
    saveSessionsToDisk();
    console.log(`[GECOLASHARE ZERO-TRACE] File ${sessionId} successfully downloaded by receiver & PERMANENTLY WIPED from server!`);
  }
  res.json({ success: true });
});

// Donor Kill Switch: Revoke connection immediately
app.post("/api/ephemeral/donor-revoke", (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = "revoked";
    delete session.fileDataUrl;
    delete session.fileUrl;
    purgeFileBlob(sessionId);
    saveSessionsToDisk();
    console.log(`[GECOLASHARE] Session ${sessionId} REVOKED by donor`);
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
  if (session.status !== 'purged') {
    session.fileUrl = `/api/ephemeral/download/${session.id}`;
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
    console.log(`GecolaShare 2026@AETERNA attivo su http://0.0.0.0:${PORT}`);
  });
}

startServer();
