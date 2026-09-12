import { EphemeralSession } from '../types';
import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs, 
  onSnapshot 
} from 'firebase/firestore';

const STORAGE_KEY = 'safehandshake_ephemeral_sessions';

export function getLocalSessions(): EphemeralSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveLocalSessions(sessions: EphemeralSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('safehandshake_sync'));
  } catch {
    // ignore
  }
}

export function saveOrUpdateLocalSession(session: EphemeralSession) {
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  if (index !== -1) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }
  saveLocalSessions(sessions);
}

function generate4DigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ==================== TRIPLE-SYNCED (SERVER + FIRESTORE + LOCAL) API ====================

export async function requestReceiverCode(message: string): Promise<EphemeralSession> {
  const cleanMessage = message?.trim() || "Ciao! Mi mandi il tuo documento di identità per favore?";
  
  let createdSession: EphemeralSession | null = null;

  // 1. Send to Express Server
  try {
    const res = await fetch('/api/ephemeral/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: cleanMessage })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        createdSession = data.session;
      }
    }
  } catch (err) {
    console.warn('[API] Express server call failed:', err);
  }

  // Fallback generation if server didn't respond
  if (!createdSession) {
    const now = Date.now();
    const receiverCode = generate4DigitCode();
    const sessionId = "tx_" + Math.random().toString(36).substring(2, 9);
    createdSession = {
      id: sessionId,
      receiverMessage: cleanMessage,
      receiverCode,
      receiverCodeCreatedAt: now,
      receiverCodeExpiresAt: now + 15 * 60 * 1000, // 15 mins
      status: 'pending_donor_upload',
      createdAt: now
    };
  }

  // 2. Write to Firestore Cloud DB
  try {
    const sessionRef = doc(db, 'sessions', createdSession.id);
    await setDoc(sessionRef, createdSession);
    console.log('[API] Session written to Firestore:', createdSession.id, createdSession.receiverCode);
  } catch (err) {
    console.error('[API] Firestore write error:', err);
  }

  // 3. Cache in LocalStorage
  saveOrUpdateLocalSession(createdSession);

  return createdSession;
}

export async function donorLoadRequest(receiverCode: string): Promise<EphemeralSession> {
  const codeStr = receiverCode ? receiverCode.toString().replace(/\D/g, '') : '';
  if (!codeStr || codeStr.length !== 4) {
    throw new Error('Inserisci un codice ricevente di 4 cifre valido.');
  }

  const now = Date.now();

  // 1. Try Express Backend Server first
  try {
    const res = await fetch('/api/ephemeral/donor-load-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverCode: codeStr })
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        console.log('[API] Found session via Express server:', data.session.id);
        saveOrUpdateLocalSession(data.session);
        return data.session;
      }
    }
  } catch (err) {
    console.warn('[API] Express server lookup error:', err);
  }

  // 2. Query Firestore Cloud DB for matching code
  try {
    const sessionsRef = collection(db, 'sessions');
    const q = query(sessionsRef, where('receiverCode', '==', codeStr));
    const querySnapshot = await getDocs(q);

    const matches: EphemeralSession[] = [];
    querySnapshot.forEach((d) => {
      const data = d.data() as EphemeralSession;
      if (data.status !== 'revoked' && data.status !== 'expired' && now <= data.receiverCodeExpiresAt) {
        matches.push(data);
      }
    });

    if (matches.length > 0) {
      matches.sort((a, b) => b.createdAt - a.createdAt);
      const target = matches[0];
      console.log('[API] Found session via Firestore:', target.id);
      saveOrUpdateLocalSession(target);
      return target;
    }
  } catch (err) {
    console.warn('[API] Firestore query error:', err);
  }

  // 3. Local Fallback Check
  const localSessions = getLocalSessions();
  const found = localSessions.find(s => 
    s.receiverCode === codeStr && 
    s.status !== 'revoked' && 
    s.status !== 'expired' &&
    now <= s.receiverCodeExpiresAt
  );

  if (found) {
    console.log('[API] Found session via LocalStorage:', found.id);
    return found;
  }

  throw new Error(`Codice ricevente "${codeStr}" non trovato o scaduto. Ricontrolla le 4 cifre.`);
}

export async function donorAttachFile(
  sessionId: string,
  fileName: string,
  fileSize: string,
  fileType: string,
  fileDataUrl: string
): Promise<{ session: EphemeralSession; donorCode: string }> {
  let updatedSession: EphemeralSession | null = null;
  let donorCode: string | null = null;

  // 1. Send to Express Server (handles up to 500 MB)
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
        updatedSession = data.session;
        donorCode = data.donorCode;
      }
    }
  } catch (err) {
    console.warn('[API] Express server attach file warning:', err);
  }

  const now = Date.now();
  if (!donorCode) {
    donorCode = generate4DigitCode();
  }

  const updateFields: any = {
    fileName: fileName || 'documento.jpg',
    fileSize: fileSize || '1.2 MB',
    fileType: fileType || 'image/jpeg',
    fileUrl: `/api/ephemeral/download/${sessionId}`,
    donorCode,
    donorCodeCreatedAt: now,
    donorCodeExpiresAt: now + 15 * 60 * 1000,
    status: 'pending_receiver_unlock' as const
  };

  // Only store fileDataUrl in Firestore if it's smaller than 400KB to prevent 1MB Firestore limit
  if (fileDataUrl && fileDataUrl.length < 400000) {
    updateFields.fileDataUrl = fileDataUrl;
  }

  // 2. Update Firestore for real-time signaling (lightweight payload < 1KB)
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    await updateDoc(sessionRef, updateFields);
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      const fsSession = snap.data() as EphemeralSession;
      if (!updatedSession) updatedSession = fsSession;
    }
  } catch (err) {
    console.error('[API] Firestore updateDoc error:', err);
  }

  // 3. Update LocalStorage
  const localSessions = getLocalSessions();
  const index = localSessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    const localUpdated: EphemeralSession = {
      ...localSessions[index],
      ...updateFields,
      fileDataUrl // store full locally if available
    };
    saveOrUpdateLocalSession(localUpdated);
    if (!updatedSession) updatedSession = localUpdated;
  } else if (updatedSession) {
    saveOrUpdateLocalSession(updatedSession);
  } else {
    throw new Error('Sessione non valida o scaduta.');
  }

  return { session: updatedSession, donorCode };
}

export async function receiverUnlock(sessionId: string, donorCode: string): Promise<EphemeralSession> {
  const codeStr = donorCode ? donorCode.toString().replace(/\D/g, '') : '';
  let unlockedSession: EphemeralSession | null = null;

  // 1. Send to Express Server
  try {
    const res = await fetch('/api/ephemeral/receiver-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, donorCode: codeStr })
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        unlockedSession = data.session;
      } else if (data.error) {
        throw new Error(data.error);
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Codice donatore errato')) {
      throw err;
    }
  }

  const now = Date.now();
  const updateFields = {
    status: 'unlocked' as const,
    unlockedAt: now,
    unlockedExpiresAt: now + 30 * 60 * 1000
  };

  // 2. Update Firestore
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      const current = snap.data() as EphemeralSession;
      if (current.status !== 'unlocked' && current.donorCode !== codeStr) {
        throw new Error('Codice donatore errato o scaduto.');
      }
      await updateDoc(sessionRef, updateFields);
      if (!unlockedSession) unlockedSession = { ...current, ...updateFields };
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Codice donatore errato')) {
      throw err;
    }
    console.warn('[API] Firestore unlock warning:', err);
  }

  // 3. Local Fallback
  const localSessions = getLocalSessions();
  const index = localSessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    const s = localSessions[index];
    if (s.donorCode === codeStr || s.status === 'unlocked') {
      s.status = 'unlocked';
      s.unlockedAt = now;
      s.unlockedExpiresAt = now + 30 * 60 * 1000;
      saveLocalSessions(localSessions);
      if (!unlockedSession) unlockedSession = s;
    } else {
      throw new Error('Codice donatore errato o scaduto.');
    }
  }

  if (unlockedSession) {
    saveOrUpdateLocalSession(unlockedSession);
    return unlockedSession;
  }

  throw new Error('Impossibile sbloccare la sessione.');
}

export async function donorRevoke(sessionId: string): Promise<void> {
  // 1. Express Server
  try {
    await fetch('/api/ephemeral/donor-revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (e) {
    // ignore
  }

  // 2. Firestore
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    await updateDoc(sessionRef, {
      status: 'revoked',
      fileDataUrl: ''
    });
  } catch (err) {
    // ignore
  }

  // 3. Local
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions[index].status = 'revoked';
    delete sessions[index].fileDataUrl;
    saveLocalSessions(sessions);
  }
}

export async function fetchSessionStatus(sessionId: string): Promise<EphemeralSession | null> {
  // 1. Express Server
  try {
    const res = await fetch(`/api/ephemeral/status/${sessionId}`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        saveOrUpdateLocalSession(data.session);
        return data.session;
      }
    }
  } catch (e) {
    // ignore
  }

  // 2. Firestore
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      const data = snap.data() as EphemeralSession;
      saveOrUpdateLocalSession(data);
      return data;
    }
  } catch (err) {
    // ignore
  }

  // 3. Local
  const sessions = getLocalSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

export function subscribeToSession(sessionId: string, callback: (session: EphemeralSession) => void) {
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    return onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as EphemeralSession;
        saveOrUpdateLocalSession(data);
        callback(data);
      }
    });
  } catch (err) {
    console.warn('[API] Subscription error:', err);
    return () => {};
  }
}
