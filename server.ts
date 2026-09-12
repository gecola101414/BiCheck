import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();

// Set 500 MB payload limit for large real files (PDFs, Images, Docs)
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
  status: 'pending_donor_upload' | 'pending_receiver_unlock' | 'unlocked' | 'revoked' | 'expired';
  unlockedAt?: number;
  unlockedExpiresAt?: number;
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

// Delete file blob from memory and disk
function deleteFileBlob(sessionId: string) {
  fileMemoryStore.delete(sessionId);
  try {
    const filePath = path.join(BLOBS_DIR, `${sessionId}.dat`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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

// Automatic cleanup of expired sessions
function cleanupSessions() {
  const now = Date.now();
  let changed = false;

  for (const [id, session] of activeSessions.entries()) {
    if (session.status === 'pending_donor_upload' && now > session.receiverCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      deleteFileBlob(id);
      changed = true;
    } else if (session.status === 'pending_receiver_unlock' && session.donorCodeExpiresAt && now > session.donorCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      deleteFileBlob(id);
      changed = true;
    } else if (session.status === 'unlocked' && session.unlockedExpiresAt && now > session.unlockedExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      deleteFileBlob(id);
      changed = true;
    }
  }

  if (changed) {
    saveSessionsToDisk();
  }
}

setInterval(cleanupSessions, 5000);

// ==================== EPHEMERAL API ====================

app.get("/api/health", (req, res) => {
  cleanupSessions();
  res.json({ status: "ok", activeCount: activeSessions.size });
});

// Step 1: Receiver generates a customized request & 4-digit Receiver Code
app.post("/api/ephemeral/request", (req, res) => {
  const { message } = req.body;
  const receiverMessage = message?.trim() || "Ciao! Mi mandi il tuo documento di identità per favore?";
  
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

  console.log(`[SERVER] New Receiver Code generated: ${receiverCode} (Session ID: ${sessionId})`);
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
    .filter(s => s.receiverCode === codeStr && s.status !== "revoked" && s.status !== "expired")
    .sort((a, b) => b.createdAt - a.createdAt);

  if (matches.length === 0) {
    console.warn(`[SERVER] Lookup failed for Receiver Code: "${codeStr}". Active sessions count: ${activeSessions.size}`);
    return res.status(404).json({ 
      error: "Codice ricevente invalido o scaduto. Ricontrolla le 4 cifre." 
    });
  }

  const targetSession = matches[0];
  console.log(`[SERVER] Match found for Receiver Code: ${codeStr} -> Session ${targetSession.id}`);
  res.json({ success: true, session: targetSession });
});

// Step 3: Donor attaches file & generates 4-digit Donor Code
app.post("/api/ephemeral/donor-attach-file", (req, res) => {
  const { sessionId, fileName, fileSize, fileType, fileDataUrl } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session || session.status === "revoked" || session.status === "expired") {
    return res.status(404).json({ error: "Sessione non valida o scaduta." });
  }

  const now = Date.now();
  const donorCode = generate4DigitCode();

  session.fileName = fileName || "documento.pdf";
  session.fileSize = fileSize || "1.2 MB";
  session.fileType = fileType || "application/pdf";
  
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
  session.donorCodeExpiresAt = now + 15 * 60 * 1000; // 15 mins
  session.status = "pending_receiver_unlock";

  saveSessionsToDisk();
  console.log(`[SERVER] File attached for session ${sessionId}. Donor Code: ${donorCode}`);
  res.json({ success: true, session, donorCode });
});

// Step 4: Receiver inputs Donor Code to unlock file download
app.post("/api/ephemeral/receiver-unlock", (req, res) => {
  const { sessionId, donorCode } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Sessione non trovata." });
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
  session.unlockedExpiresAt = now + 30 * 60 * 1000; // 30 minutes download window

  saveSessionsToDisk();
  console.log(`[SERVER] File unlocked successfully for session ${sessionId}`);
  res.json({ success: true, session });
});

// Dedicated File Download / Stream Endpoint (up to 500 MB)
app.get("/api/ephemeral/download/:sessionId", (req, res) => {
  cleanupSessions();
  const session = activeSessions.get(req.params.sessionId);
  if (!session || session.status === "revoked" || session.status === "expired") {
    return res.status(404).send("File non disponibile, revocato o scaduto.");
  }

  const fileData = session.fileDataUrl || getFileBlob(req.params.sessionId);
  if (!fileData) {
    return res.status(404).send("File non trovato.");
  }

  const commaIdx = fileData.indexOf(",");
  if (commaIdx !== -1 && fileData.startsWith("data:")) {
    const header = fileData.substring(0, commaIdx);
    const base64Str = fileData.substring(commaIdx + 1);
    
    const mimeMatch = header.match(/^data:(.+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : (session.fileType || "application/pdf");
    const buffer = Buffer.from(base64Str, "base64");

    const rawFileName = session.fileName || "documento.pdf";
    const safeFileName = encodeURIComponent(rawFileName).replace(/['()]/g, escape).replace(/\*/g, "%2A");

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Content-Disposition", `attachment; filename="${rawFileName.replace(/["\r\n]/g, "")}"; filename*=UTF-8''${safeFileName}`);
    return res.send(buffer);
  }

  // Plain text fallback
  res.setHeader("Content-Type", session.fileType || "application/octet-stream");
  res.send(fileData);
});

// Donor Kill Switch: Revoke connection immediately
app.post("/api/ephemeral/donor-revoke", (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = "revoked";
    delete session.fileDataUrl;
    deleteFileBlob(sessionId);
    saveSessionsToDisk();
    console.log(`[SERVER] Session ${sessionId} REVOKED by donor`);
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
  session.fileUrl = `/api/ephemeral/download/${session.id}`;
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
    console.log(`Server SafeHandshake attivo su http://0.0.0.0:${PORT}`);
  });
}

startServer();
