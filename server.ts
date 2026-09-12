import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = 3000;

// Lazy initialize Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getGenAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// In-Memory Handshake Store & Audit Log Store
interface InternalSession {
  id: string;
  receiverName: string;
  receiverRole: string;
  receiverCode: string;
  receiverCodeCreatedAt: number;
  receiverCodeExpiresAt: number;
  donorCode?: string;
  donorCodeCreatedAt?: number;
  donorCodeExpiresAt?: number;
  documentId: string;
  documentTitle: string;
  shareMode: 'essential_text' | 'full_document';
  status: 'pending_donor_auth' | 'pending_receiver_entry' | 'unlocked' | 'expired' | 'denied';
  unlockedAt?: number;
  unlockedExpiresAt?: number;
  ipAddress: string;
  essentialData?: Record<string, string>;
  fileUrl?: string;
}

let activeSessions: Map<string, InternalSession> = new Map();
let auditLogs: Array<{
  id: string;
  timestamp: string;
  receiverName: string;
  documentTitle: string;
  shareMode: 'essential_text' | 'full_document';
  action: 'REQUEST_GENERATED' | 'DONOR_AUTHORIZED' | 'HANDSHAKE_COMPLETED' | 'SESSION_EXPIRED' | 'ACCESS_DENIED';
  handshakeTx: string;
  ipAddress: string;
  details: string;
}> = [
  {
    id: 'log-seed-1',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    receiverName: 'Hotel Continental Reception',
    documentTitle: "Carta d'Identità Elettronica",
    shareMode: 'essential_text',
    action: 'HANDSHAKE_COMPLETED',
    handshakeTx: 'TX_849201',
    ipAddress: '192.168.1.45',
    details: 'Visualizzazione dati essenziali completata con successo (No Foto). Durata sessione: 10 min.'
  }
];

// Helper to generate a random 4-digit code
function generate4DigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper to cleanup expired sessions
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (session.status === 'pending_donor_auth' && now > session.receiverCodeExpiresAt) {
      session.status = 'expired';
    } else if (session.status === 'pending_receiver_entry' && session.donorCodeExpiresAt && now > session.donorCodeExpiresAt) {
      session.status = 'expired';
    } else if (session.status === 'unlocked' && session.unlockedExpiresAt && now > session.unlockedExpiresAt) {
      session.status = 'expired';
    }
  }
}
setInterval(cleanupSessions, 5000);

// ==================== API ENDPOINTS ====================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", activeSessionsCount: activeSessions.size });
});

// Gemini AI Smart OCR & Data Extraction endpoint
app.post("/api/ocr-extract", async (req, res) => {
  try {
    const { imageBase64, textContent, categoryHint } = req.body;
    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({ 
        error: "GEMINI_API_KEY non configurato nei secrets. È stata usata la modalità simulata localmente." 
      });
    }

    const systemInstruction = `Sei un esperto di analisi documentale GDPR e OCR. 
Estrai i dati essenziali in formato JSON da questo documento.
Rispondi RIGOROSAMENTE con una struttura JSON con i seguenti campi:
- title: string (es. "Carta d'Identità Elettronica", "Patente di Guida", ecc.)
- documentNumber: string
- ownerName: string
- issueDate: string (formato YYYY-MM-DD o DD/MM/YYYY)
- expiryDate: string
- issuingAuthority: string
- category: "identity" | "license" | "passport" | "tax" | "health" | "utility" | "contract" | "other"
- essentialFields: un oggetto con chiavi-valore di tutti i dati essenziali minimizzati (es. Cognome, Nome, Data di Nascita, Luogo Nascita, Codice Fiscale, Indirizzo, Scadenza, ecc.)`;

    let responseText = "";

    if (imageBase64) {
      // Remove data URL prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          {
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: base64Data } },
              { text: "Estrai tutti i dati essenziali di questo documento per la minimizzazione GDPR." }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      });
      responseText = response.text || "{}";
    } else if (textContent) {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Analizza ed estrai i dati essenziali dal seguente testo di documento (${categoryHint || 'documento'}):\n\n${textContent}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      });
      responseText = response.text || "{}";
    } else {
      return res.status(400).json({ error: "Nessuna immagine o testo inviato per l'analisi OCR." });
    }

    const parsedData = JSON.parse(responseText);
    return res.json({ success: true, data: parsedData });
  } catch (err: any) {
    console.error("AI OCR Extraction Error:", err);
    return res.status(500).json({ error: "Errore durante l'estrazione con AI: " + (err.message || String(err)) });
  }
});

// Step 1: Receiver generates a 4-digit Receiver Code (valid for 2 mins)
app.post("/api/handshake/create-receiver-code", (req, res) => {
  const { receiverName, receiverRole, documentId, documentTitle, shareMode } = req.body;
  
  if (!receiverName || !documentId) {
    return res.status(400).json({ error: "Nome ricevente e documento richiesti" });
  }

  const now = Date.now();
  const receiverCode = generate4DigitCode();
  const sessionId = "tx_" + Math.random().toString(36).substring(2, 9);

  const session: InternalSession = {
    id: sessionId,
    receiverName: receiverName || "Ricevente Anonimo",
    receiverRole: receiverRole || "Verificatore",
    receiverCode,
    receiverCodeCreatedAt: now,
    receiverCodeExpiresAt: now + 120 * 1000, // 2 minutes
    documentId,
    documentTitle: documentTitle || "Documento Personale",
    shareMode: shareMode || "essential_text",
    status: "pending_donor_auth",
    ipAddress: req.ip || "192.168.1." + Math.floor(Math.random() * 200 + 10)
  };

  activeSessions.set(sessionId, session);

  // Audit Log
  auditLogs.unshift({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    receiverName: session.receiverName,
    documentTitle: session.documentTitle,
    shareMode: session.shareMode,
    action: 'REQUEST_GENERATED',
    handshakeTx: sessionId.toUpperCase(),
    ipAddress: session.ipAddress,
    details: `Richiesta aperta dal ricevente. Codice Ricevente generato: ${receiverCode} (Scadenza 2 min).`
  });

  res.json({ success: true, session });
});

// Step 2: Donor inputs Receiver Code (e.g., 1122) to inspect the handshake request
app.post("/api/handshake/verify-receiver-code", (req, res) => {
  const { receiverCode } = req.body;
  cleanupSessions();

  let targetSession: InternalSession | null = null;
  for (const session of activeSessions.values()) {
    if (session.receiverCode === receiverCode && session.status === "pending_donor_auth") {
      targetSession = session;
      break;
    }
  }

  if (!targetSession) {
    return res.status(404).json({ 
      error: "Codice ricevente non trovato, già utilizzato o scaduto. Verifica le 4 cifre." 
    });
  }

  res.json({ success: true, session: targetSession });
});

// Step 3: Donor authorizes request, optionally changes share mode, and generates Donor Code (e.g., 9988)
app.post("/api/handshake/authorize-donor-code", (req, res) => {
  const { sessionId, shareMode, essentialData, fileUrl } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session || session.status !== "pending_donor_auth") {
    return res.status(404).json({ error: "Sessione di handshake non trovata o scaduta." });
  }

  const now = Date.now();
  const donorCode = generate4DigitCode();

  session.donorCode = donorCode;
  session.donorCodeCreatedAt = now;
  session.donorCodeExpiresAt = now + 120 * 1000; // 2 mins to communicate & enter donor code
  session.status = "pending_receiver_entry";
  if (shareMode) session.shareMode = shareMode;
  if (essentialData) session.essentialData = essentialData;
  if (fileUrl) session.fileUrl = fileUrl;

  auditLogs.unshift({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    receiverName: session.receiverName,
    documentTitle: session.documentTitle,
    shareMode: session.shareMode,
    action: 'DONOR_AUTHORIZED',
    handshakeTx: session.id.toUpperCase(),
    ipAddress: session.ipAddress,
    details: `Il Donatore ha autorizzato l'accesso (${session.shareMode === 'essential_text' ? 'Solo Dati Essenziali GDPR' : 'Documento Completo'}). Codice Donatore generato: ${donorCode} (Scadenza 2 min).`
  });

  res.json({ success: true, session, donorCode });
});

// Step 4: Receiver enters Donor Code (e.g. 9988) to unlock 10-minute access window
app.post("/api/handshake/unlock-session", (req, res) => {
  const { sessionId, donorCode } = req.body;
  cleanupSessions();

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Sessione non trovata." });
  }

  if (session.status === "unlocked") {
    return res.json({ success: true, session });
  }

  if (session.status !== "pending_receiver_entry" || session.donorCode !== donorCode) {
    return res.status(400).json({ error: "Codice Donatore errato o sessione non autorizzata dal donatore." });
  }

  const now = Date.now();
  session.status = "unlocked";
  session.unlockedAt = now;
  session.unlockedExpiresAt = now + 600 * 1000; // 10 minute access window

  auditLogs.unshift({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    receiverName: session.receiverName,
    documentTitle: session.documentTitle,
    shareMode: session.shareMode,
    action: 'HANDSHAKE_COMPLETED',
    handshakeTx: session.id.toUpperCase(),
    ipAddress: session.ipAddress,
    details: `Stretta di mano bilaterale COMPLETATA CON SUCCESSO. Accesso sbloccato per 10 minuti fino alle ${new Date(session.unlockedExpiresAt).toLocaleTimeString()}.`
  });

  res.json({ success: true, session });
});

// Donor rejects session
app.post("/api/handshake/deny-session", (req, res) => {
  const { sessionId } = req.body;
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = "denied";
    auditLogs.unshift({
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      receiverName: session.receiverName,
      documentTitle: session.documentTitle,
      shareMode: session.shareMode,
      action: 'ACCESS_DENIED',
      handshakeTx: session.id.toUpperCase(),
      ipAddress: session.ipAddress,
      details: 'Il Donatore ha rifiutato la richiesta di sblocco.'
    });
  }
  res.json({ success: true });
});

// Poll session status
app.get("/api/handshake/status/:sessionId", (req, res) => {
  cleanupSessions();
  const session = activeSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Sessione non trovata" });
  }
  res.json({ success: true, session });
});

// Get Audit Logs
app.get("/api/audit-logs", (req, res) => {
  res.json({ success: true, logs: auditLogs });
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
    console.log(`Server SafeHandshake in ascolto su http://0.0.0.0:${PORT}`);
  });
}

startServer();
