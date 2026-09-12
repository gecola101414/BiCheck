import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();

// Set 2000 MB payload limit for E2EE encrypted real files up to 1 GB
app.use(express.json({ limit: "2000mb" }));
app.use(express.urlencoded({ limit: "2000mb", extended: true }));

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
    console.log(`[SERVER DISK BLOB] Saved ${dataUrl.length} bytes to ${filePath}`);
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

// Automatic cleanup of expired sessions (3 minutes lifespan rule as requested)
const THREE_MINUTES_MS = 3 * 60 * 1000;

function cleanupSessions() {
  const now = Date.now();
  let changed = false;

  for (const [id, session] of activeSessions.entries()) {
    const isExceededThreeMinutes = (now - session.createdAt) > THREE_MINUTES_MS;

    if (session.status !== 'purged' && session.status !== 'expired' && isExceededThreeMinutes) {
      session.status = 'expired';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
      console.log(`[GECOLASHARE AUTO-CLEANUP] Session ${id} reached 3 minute limit. Auto-purged from server.`);
    } else if (session.status === 'pending_donor_upload' && now > session.receiverCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
    } else if (session.status === 'pending_receiver_unlock' && session.donorCodeExpiresAt && now > session.donorCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      delete session.fileUrl;
      purgeFileBlob(id);
      changed = true;
    } else if (session.status === 'unlocked' && session.unlockedExpiresAt && now > session.unlockedExpiresAt) {
      session.status = 'expired';
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

setInterval(cleanupSessions, 2000);

// ==================== GECOLASHARE EPHEMERAL API ====================

app.get("/api/health", (req, res) => {
  cleanupSessions();
  res.json({ status: "ok", appName: "GecolaShare", version: "2026@AETERNA", activeCount: activeSessions.size });
});

// MODE 3: DIRECT QUICK TRANSFER (Senza Cifratura E2EE) - Upload
app.post("/api/ephemeral/direct-upload", (req, res) => {
  const { fileName, fileSize, fileType, fileDataUrl } = req.body;
  cleanupSessions();

  const now = Date.now();
  const quickCode = generate4DigitCode();
  const sessionId = "dir_" + Math.random().toString(36).substring(2, 9);

  const session: EphemeralSessionInternal & { quickCode?: string } = {
    id: sessionId,
    receiverMessage: "Trasferimento Diretto Veloce",
    receiverCode: "0000",
    receiverCodeCreatedAt: now,
    receiverCodeExpiresAt: now + THREE_MINUTES_MS,
    quickCode,
    fileName: fileName || "documento.pdf",
    fileSize: fileSize || "1.0 MB",
    fileType: fileType || "application/octet-stream",
    fileDataUrl: fileDataUrl,
    isEncrypted: false,
    status: "unlocked",
    createdAt: now,
    donorCodeExpiresAt: now + THREE_MINUTES_MS,
    unlockedExpiresAt: now + THREE_MINUTES_MS
  };

  if (fileDataUrl) {
    saveFileBlob(sessionId, fileDataUrl);
    session.fileUrl = `/api/ephemeral/download/${sessionId}`;
  }

  activeSessions.set(sessionId, session);
  saveSessionsToDisk();

  console.log(`[GECOLASHARE DIRECT TRANSFER] File uploaded directly. Quick Code: ${quickCode} (Session: ${sessionId})`);
  res.json({ success: true, session, quickCode });
});

// MODE 3 LOOKUP: Receiver enters 4-digit Quick Code for Direct Transfer
app.post("/api/ephemeral/direct-lookup", (req, res) => {
  const { quickCode } = req.body;
  cleanupSessions();

  const codeStr = quickCode ? quickCode.toString().replace(/\D/g, "") : "";
  if (!codeStr || codeStr.length !== 4) {
    return res.status(400).json({ error: "Inserisci un codice di 4 cifre valido." });
  }

  const matches = Array.from(activeSessions.values())
    .filter(s => (s as any).quickCode === codeStr && s.status !== "purged" && s.status !== "expired" && s.status !== "revoked")
    .sort((a, b) => b.createdAt - a.createdAt);

  if (matches.length === 0) {
    return res.status(404).json({ error: "Codice non trovato, scaduto o file già auto-distrutto." });
  }

  const session = matches[0];
  res.json({ success: true, session });
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
    receiverCodeExpiresAt: now + THREE_MINUTES_MS, // 3 minutes validity
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
  const { sessionId, fileName, fileSize, fileType, fileDataUrl, isEncrypted, receiverCode, donorCode: requestedDonorCode } = req.body;
  cleanupSessions();

  let session = activeSessions.get(sessionId);
  const now = Date.now();

  // Robust Fail-Safe: If session missing from Express memory, reconstruct it automatically!
  if (!session) {
    session = {
      id: sessionId,
      receiverMessage: "Richiesta documento",
      receiverCode: receiverCode || "0000",
      receiverCodeCreatedAt: now,
      receiverCodeExpiresAt: now + THREE_MINUTES_MS,
      status: "pending_donor_upload",
      createdAt: now
    };
    activeSessions.set(sessionId, session);
  }

  if (session.status === "revoked" || session.status === "expired" || session.status === "purged") {
    return res.status(404).json({ error: "Sessione non valida, revocata o già cancellata." });
  }

  const donorCode = requestedDonorCode || generate4DigitCode();

  session.fileName = fileName || "documento.pdf";
  session.fileSize = fileSize || "1.2 MB";
  session.fileType = fileType || "application/pdf";
  session.isEncrypted = !!isEncrypted;
  
  if (fileDataUrl) {
    saveFileBlob(sessionId, fileDataUrl);
    session.fileUrl = `/api/ephemeral/download/${sessionId}`;
    session.fileDataUrl = fileDataUrl; // Retain in memory for instant delivery
  }

  session.donorCode = donorCode;
  session.donorCodeCreatedAt = now;
  session.donorCodeExpiresAt = now + THREE_MINUTES_MS;
  session.status = "pending_receiver_unlock";

  saveSessionsToDisk();
  console.log(`[GECOLASHARE] E2EE Encrypted file attached & blob saved for ${sessionId}. Donor Code: ${donorCode}`);
  res.json({ success: true, session, donorCode });
});

// Step 4: Receiver inputs Donor Code to unlock file download
app.post("/api/ephemeral/receiver-unlock", (req, res) => {
  const { sessionId, donorCode } = req.body;
  cleanupSessions();

  let session = activeSessions.get(sessionId);

  // If session missing from memory map, check if file blob exists on disk!
  if (!session) {
    const blob = getFileBlob(sessionId);
    if (blob) {
      const now = Date.now();
      session = {
        id: sessionId,
        receiverMessage: "Richiesta documento",
        receiverCode: "0000",
        receiverCodeCreatedAt: now,
        receiverCodeExpiresAt: now + THREE_MINUTES_MS,
        donorCode: donorCode,
        donorCodeCreatedAt: now,
        donorCodeExpiresAt: now + THREE_MINUTES_MS,
        status: "pending_receiver_unlock",
        createdAt: now
      };
      activeSessions.set(sessionId, session);
    } else {
      return res.status(404).json({ error: "Sessione non trovata o file non presente sul server." });
    }
  }

  if (session.status === "purged") {
    return res.status(404).json({ error: "Sessione non trovata o file già auto-distrutto." });
  }

  const codeStr = donorCode ? donorCode.toString().replace(/\D/g, "") : "";

  if (session.status === "unlocked") {
    return res.json({ success: true, session });
  }

  if (session.donorCode && session.donorCode !== codeStr) {
    return res.status(400).json({ error: "Codice donatore errato o scaduto." });
  }

  const now = Date.now();
  session.status = "unlocked";
  session.unlockedAt = now;
  session.unlockedExpiresAt = now + THREE_MINUTES_MS;

  saveSessionsToDisk();
  console.log(`[GECOLASHARE] File unlocked for ${sessionId}`);
  res.json({ success: true, session });
});

// Dedicated File Stream Endpoint (Serves file payload for client download)
app.get("/api/ephemeral/download/:sessionId", (req, res) => {
  cleanupSessions();
  const session = activeSessions.get(req.params.sessionId);
  const fileBlob = getFileBlob(req.params.sessionId);

  if (!fileBlob && (!session || (!session.fileDataUrl && !session.fileUrl))) {
    return res.status(404).send("File non disponibile o scaduto al termine dei 3 minuti.");
  }

  const fileData = fileBlob || session?.fileDataUrl;
  if (!fileData) {
    return res.status(404).send("File non trovato sul server.");
  }

  // Check if fileData is a Base64 Data URL (e.g., data:application/pdf;base64,JVBERi...)
  const match = fileData.match(/^data:(.*?);base64,(.*)$/);
  if (match) {
    const mimeType = match[1] || session?.fileType || "application/octet-stream";
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(session?.fileName || "documento")}"`);
    return res.send(buffer);
  }

  // Fallback for raw text / E2EE encrypted payload
  res.setHeader("Content-Type", "text/plain");
  res.send(fileData);
});

// Explicit Post-Download Confirmation: Logs download and preserves file until 3 min expiration
app.post("/api/ephemeral/confirm-purge", (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (session) {
    (session as any).downloaded = true;
    (session as any).downloadedAt = Date.now();
    saveSessionsToDisk();
    console.log(`[GECOLASHARE] File ${sessionId} downloaded by receiver. Will auto-purge at end of 3 minutes.`);
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
  } else {
    purgeFileBlob(sessionId);
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
