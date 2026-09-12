import { EphemeralSession } from '../types';

const STORAGE_KEY = 'safehandshake_ephemeral_sessions';

function getLocalSessions(): EphemeralSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions: EphemeralSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    // Broadcast change across tabs
    window.dispatchEvent(new Event('storage'));
  } catch {
    // ignore
  }
}

function generate4DigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function cleanupLocalSessions() {
  const sessions = getLocalSessions();
  const now = Date.now();
  let changed = false;

  for (const session of sessions) {
    if (session.status === 'pending_donor_upload' && now > session.receiverCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      changed = true;
    } else if (session.status === 'pending_receiver_unlock' && session.donorCodeExpiresAt && now > session.donorCodeExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      changed = true;
    } else if (session.status === 'unlocked' && session.unlockedExpiresAt && now > session.unlockedExpiresAt) {
      session.status = 'expired';
      delete session.fileDataUrl;
      changed = true;
    }
  }

  if (changed) saveLocalSessions(sessions);
}

// ==================== HYBRID API SERVICE ====================

export async function requestReceiverCode(message: string): Promise<EphemeralSession> {
  // Try backend first
  try {
    const res = await fetch('/api/ephemeral/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        return data.session;
      }
    }
  } catch (err) {
    console.warn('Backend API unavailable, switching to local memory fallback', err);
  }

  // Local fallback
  cleanupLocalSessions();
  const now = Date.now();
  const session: EphemeralSession = {
    id: 'tx_' + Math.random().toString(36).substring(2, 9),
    receiverMessage: message?.trim() || "Ciao! Mi mandi il tuo documento per favore?",
    receiverCode: generate4DigitCode(),
    receiverCodeCreatedAt: now,
    receiverCodeExpiresAt: now + 120 * 1000,
    status: 'pending_donor_upload',
    createdAt: now
  };

  const sessions = getLocalSessions();
  sessions.push(session);
  saveLocalSessions(sessions);
  return session;
}

export async function donorLoadRequest(receiverCode: string): Promise<EphemeralSession> {
  // Try backend first
  try {
    const res = await fetch('/api/ephemeral/donor-load-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverCode })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        return data.session;
      } else if (data.error) {
        throw new Error(data.error);
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Unexpected token') && !err.message.includes('JSON')) {
      throw err;
    }
  }

  // Local fallback
  cleanupLocalSessions();
  const sessions = getLocalSessions();
  const session = sessions.find(s => s.receiverCode === receiverCode && s.status === 'pending_donor_upload');

  if (!session) {
    throw new Error('Codice ricevente non trovato o scaduto (valido 2 minuti). Ricontrolla le 4 cifre.');
  }

  return session;
}

export async function donorAttachFile(
  sessionId: string,
  fileName: string,
  fileSize: string,
  fileType: string,
  fileDataUrl: string
): Promise<{ session: EphemeralSession; donorCode: string }> {
  // Try backend first
  try {
    const res = await fetch('/api/ephemeral/donor-attach-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, fileName, fileSize, fileType, fileDataUrl })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session && data.donorCode) {
        return { session: data.session, donorCode: data.donorCode };
      } else if (data.error) {
        throw new Error(data.error);
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Unexpected token') && !err.message.includes('JSON')) {
      throw err;
    }
  }

  // Local fallback
  cleanupLocalSessions();
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1 || sessions[index].status !== 'pending_donor_upload') {
    throw new Error('Sessione non valida o scaduta.');
  }

  const now = Date.now();
  const donorCode = generate4DigitCode();
  sessions[index].fileName = fileName || 'documento.jpg';
  sessions[index].fileSize = fileSize || '1.2 MB';
  sessions[index].fileType = fileType || 'image/jpeg';
  sessions[index].fileDataUrl = fileDataUrl;
  sessions[index].donorCode = donorCode;
  sessions[index].donorCodeCreatedAt = now;
  sessions[index].donorCodeExpiresAt = now + 120 * 1000;
  sessions[index].status = 'pending_receiver_unlock';

  saveLocalSessions(sessions);
  return { session: sessions[index], donorCode };
}

export async function receiverUnlock(sessionId: string, donorCode: string): Promise<EphemeralSession> {
  // Try backend first
  try {
    const res = await fetch('/api/ephemeral/receiver-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, donorCode })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        return data.session;
      } else if (data.error) {
        throw new Error(data.error);
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Unexpected token') && !err.message.includes('JSON')) {
      throw err;
    }
  }

  // Local fallback
  cleanupLocalSessions();
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1) {
    throw new Error('Sessione non trovata.');
  }

  const s = sessions[index];
  if (s.status === 'unlocked') {
    return s;
  }

  if (s.status !== 'pending_receiver_unlock' || s.donorCode !== donorCode) {
    throw new Error('Codice donatore errato o scaduto.');
  }

  const now = Date.now();
  s.status = 'unlocked';
  s.unlockedAt = now;
  s.unlockedExpiresAt = now + 600 * 1000;

  saveLocalSessions(sessions);
  return s;
}

export async function donorRevoke(sessionId: string): Promise<void> {
  try {
    await fetch('/api/ephemeral/donor-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (e) {
    // ignore
  }

  // Always update local fallback
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions[index].status = 'revoked';
    delete sessions[index].fileDataUrl;
    saveLocalSessions(sessions);
  }
}

export async function fetchSessionStatus(sessionId: string): Promise<EphemeralSession | null> {
  try {
    const res = await fetch(`/api/ephemeral/status/${sessionId}`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        return data.session;
      }
    }
  } catch (e) {
    // ignore
  }

  // Fallback to local
  cleanupLocalSessions();
  const sessions = getLocalSessions();
  return sessions.find(s => s.id === sessionId) || null;
}
