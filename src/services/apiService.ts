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

// ==================== REAL-TIME FIRESTORE API SERVICE ====================

export async function requestReceiverCode(message: string): Promise<EphemeralSession> {
  const cleanMessage = message?.trim() || "Ciao! Mi mandi il tuo documento di identità per favore?";
  const now = Date.now();
  const receiverCode = generate4DigitCode();
  const sessionId = "tx_" + Math.random().toString(36).substring(2, 9);

  const sessionData: EphemeralSession = {
    id: sessionId,
    receiverMessage: cleanMessage,
    receiverCode,
    receiverCodeCreatedAt: now,
    receiverCodeExpiresAt: now + 15 * 60 * 1000, // 15 minutes
    status: 'pending_donor_upload',
    createdAt: now
  };

  // 1. Write to Firestore Cloud DB
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    await setDoc(sessionRef, sessionData);
  } catch (err) {
    console.warn('Firestore setDoc warning, relying on hybrid fallback:', err);
  }

  // 2. Cache in LocalStorage
  saveOrUpdateLocalSession(sessionData);

  return sessionData;
}

export async function donorLoadRequest(receiverCode: string): Promise<EphemeralSession> {
  const codeStr = receiverCode ? receiverCode.toString().replace(/\D/g, '') : '';
  if (!codeStr || codeStr.length !== 4) {
    throw new Error('Inserisci un codice ricevente di 4 cifre valido.');
  }

  const now = Date.now();

  // 1. Query Firestore Cloud DB for matching code
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
      // Sort newest first
      matches.sort((a, b) => b.createdAt - a.createdAt);
      const target = matches[0];
      saveOrUpdateLocalSession(target);
      return target;
    }
  } catch (err) {
    console.warn('Firestore query error:', err);
  }

  // 2. Local Fallback Check
  const localSessions = getLocalSessions();
  const found = localSessions.find(s => 
    s.receiverCode === codeStr && 
    s.status !== 'revoked' && 
    s.status !== 'expired' &&
    now <= s.receiverCodeExpiresAt
  );

  if (found) {
    return found;
  }

  throw new Error('Codice ricevente non trovato o scaduto. Ricontrolla le 4 cifre.');
}

export async function donorAttachFile(
  sessionId: string,
  fileName: string,
  fileSize: string,
  fileType: string,
  fileDataUrl: string
): Promise<{ session: EphemeralSession; donorCode: string }> {
  const now = Date.now();
  const donorCode = generate4DigitCode();

  const updateFields = {
    fileName: fileName || 'documento.jpg',
    fileSize: fileSize || '1.2 MB',
    fileType: fileType || 'image/jpeg',
    fileDataUrl,
    donorCode,
    donorCodeCreatedAt: now,
    donorCodeExpiresAt: now + 15 * 60 * 1000, // 15 minutes
    status: 'pending_receiver_unlock' as const
  };

  // 1. Update Firestore Cloud DB
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    await updateDoc(sessionRef, updateFields);

    const updatedSnap = await getDoc(sessionRef);
    if (updatedSnap.exists()) {
      const fullSession = updatedSnap.data() as EphemeralSession;
      saveOrUpdateLocalSession(fullSession);
      return { session: fullSession, donorCode };
    }
  } catch (err) {
    console.warn('Firestore updateDoc error:', err);
  }

  // 2. Local Fallback
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index === -1) {
    throw new Error('Sessione non valida o scaduta.');
  }

  const updatedSession: EphemeralSession = {
    ...sessions[index],
    ...updateFields
  };

  saveOrUpdateLocalSession(updatedSession);
  return { session: updatedSession, donorCode };
}

export async function receiverUnlock(sessionId: string, donorCode: string): Promise<EphemeralSession> {
  const codeStr = donorCode ? donorCode.toString().replace(/\D/g, '') : '';
  const now = Date.now();

  // 1. Try Firestore Cloud DB
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);

    if (snap.exists()) {
      const currentData = snap.data() as EphemeralSession;
      if (currentData.status === 'unlocked') {
        return currentData;
      }

      if (currentData.status !== 'pending_receiver_unlock' || currentData.donorCode !== codeStr) {
        throw new Error('Codice donatore errato o scaduto.');
      }

      const updateFields = {
        status: 'unlocked' as const,
        unlockedAt: now,
        unlockedExpiresAt: now + 30 * 60 * 1000 // 30 minutes
      };

      await updateDoc(sessionRef, updateFields);

      const unlockedSession: EphemeralSession = {
        ...currentData,
        ...updateFields
      };

      saveOrUpdateLocalSession(unlockedSession);
      return unlockedSession;
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Codice donatore errato')) {
      throw err;
    }
    console.warn('Firestore unlock error:', err);
  }

  // 2. Local Fallback
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1) {
    throw new Error('Sessione non trovata.');
  }

  const s = sessions[index];
  if (s.status === 'unlocked') {
    return s;
  }

  if (s.status !== 'pending_receiver_unlock' || s.donorCode !== codeStr) {
    throw new Error('Codice donatore errato o scaduto.');
  }

  s.status = 'unlocked';
  s.unlockedAt = now;
  s.unlockedExpiresAt = now + 30 * 60 * 1000;

  saveLocalSessions(sessions);
  return s;
}

export async function donorRevoke(sessionId: string): Promise<void> {
  // 1. Update Firestore
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    await updateDoc(sessionRef, {
      status: 'revoked',
      fileDataUrl: ''
    });
  } catch (err) {
    console.warn('Firestore revoke error:', err);
  }

  // 2. Local fallback
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions[index].status = 'revoked';
    delete sessions[index].fileDataUrl;
    saveLocalSessions(sessions);
  }
}

export async function fetchSessionStatus(sessionId: string): Promise<EphemeralSession | null> {
  // 1. Fetch from Firestore
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

  // 2. Fallback local
  const sessions = getLocalSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

/**
 * Real-time listener for instant updates across devices
 */
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
    console.warn('Snapshot listener subscription error:', err);
    return () => {};
  }
}
