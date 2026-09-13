import { EphemeralSession } from '../types';
import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  getDocs, 
  onSnapshot 
} from 'firebase/firestore';

const STORAGE_KEY = 'safehandshake_ephemeral_sessions';

const clientMemoryFileCache = new Map<string, string>();

export function cacheClientFile(sessionId: string, dataUrl: string) {
  if (sessionId && dataUrl) {
    clientMemoryFileCache.set(sessionId, dataUrl);
  }
}

export function getClientCachedFile(sessionId: string): string | null {
  return clientMemoryFileCache.get(sessionId) || null;
}

export function clearClientCachedFile(sessionId: string) {
  clientMemoryFileCache.delete(sessionId);
}

export function getLocalSessions(): EphemeralSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed: EphemeralSession[] = JSON.parse(data);
    return parsed.map(s => {
      const cached = getClientCachedFile(s.id);
      if (cached) {
        s.fileDataUrl = cached;
      }
      return s;
    });
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return [];
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error('Error converting Data URL to Blob:', e);
    return new Blob([], { type: 'application/octet-stream' });
  }
}

export async function saveFileToFirestore(sessionId: string, fileDataUrl: string): Promise<void> {
  if (!fileDataUrl) return;
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const CHUNK_SIZE = 400000;

    if (fileDataUrl.length <= CHUNK_SIZE) {
      await updateDoc(sessionRef, {
        fileDataUrl,
        isChunked: false
      }).catch(async () => {
        await setDoc(sessionRef, { fileDataUrl, isChunked: false }, { merge: true });
      });
    } else {
      const chunksCount = Math.ceil(fileDataUrl.length / CHUNK_SIZE);
      await updateDoc(sessionRef, {
        fileDataUrl: '',
        isChunked: true,
        chunksCount
      }).catch(async () => {
        await setDoc(sessionRef, { fileDataUrl: '', isChunked: true, chunksCount }, { merge: true });
      });

      const chunkPromises = [];
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = fileDataUrl.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkRef = doc(db, 'sessions', sessionId, 'chunks', `chunk_${i}`);
        chunkPromises.push(setDoc(chunkRef, {
          index: i,
          data: chunkData,
          totalChunks: chunksCount,
          createdAt: Date.now()
        }));
      }
      await Promise.all(chunkPromises);
      console.log(`[FIRESTORE] Saved ${fileDataUrl.length} bytes in ${chunksCount} chunks for session ${sessionId}`);
    }
  } catch (err) {
    console.error('[FIRESTORE] Error saving file to Firestore:', err);
  }
}

export async function getFileFromFirestore(sessionId: string): Promise<string | null> {
  const cached = getClientCachedFile(sessionId);
  if (cached) return cached;

  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data.fileDataUrl && data.fileDataUrl.length > 50) {
        cacheClientFile(sessionId, data.fileDataUrl);
        return data.fileDataUrl;
      }
    }

    // Check chunks subcollection
    const chunksRef = collection(db, 'sessions', sessionId, 'chunks');
    const chunksSnap = await getDocs(chunksRef);

    if (!chunksSnap.empty) {
      const chunks: { index: number; data: string }[] = [];
      chunksSnap.forEach(d => {
        const chunkData = d.data();
        if (typeof chunkData.index === 'number' && typeof chunkData.data === 'string') {
          chunks.push({ index: chunkData.index, data: chunkData.data });
        }
      });

      chunks.sort((a, b) => a.index - b.index);
      const fullDataUrl = chunks.map(c => c.data).join('');
      console.log(`[FIRESTORE] Reconstructed file ${fullDataUrl.length} bytes from ${chunks.length} chunks`);
      cacheClientFile(sessionId, fullDataUrl);
      return fullDataUrl;
    }
  } catch (err) {
    console.error('[FIRESTORE] Error getting file from Firestore:', err);
  }
  return null;
}

export async function purgeFirestoreSession(sessionId: string): Promise<void> {
  clearClientCachedFile(sessionId);
  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    await updateDoc(sessionRef, {
      status: 'purged',
      purgedAt: Date.now(),
      fileDataUrl: '',
      fileUrl: '',
      isChunked: false
    }).catch(() => {});

    // Delete chunks
    const chunksRef = collection(db, 'sessions', sessionId, 'chunks');
    const chunksSnap = await getDocs(chunksRef).catch(() => null);
    if (chunksSnap && !chunksSnap.empty) {
      const deletePromises: Promise<void>[] = [];
      chunksSnap.forEach(d => {
        deletePromises.push(deleteDoc(d.ref).catch(() => {}));
      });
      await Promise.all(deletePromises);
    }
  } catch (err) {
    console.warn('[FIRESTORE] Error purging session:', err);
  }
}

export async function uploadRawBlob(sessionId: string, blob: Blob | ArrayBuffer): Promise<boolean> {
  try {
    const res = await fetch(`/api/ephemeral/upload-raw-blob/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob
    });
    return res.ok;
  } catch (err) {
    console.error('Error uploading raw blob:', err);
    return false;
  }
}

export async function directUploadFile(
  fileName: string,
  fileSize: string,
  fileType: string,
  fileDataUrl: string
): Promise<{ session: EphemeralSession; quickCode: string }> {
  let session: EphemeralSession | null = null;
  let quickCode: string | null = null;

  // 1. Post metadata & complete file Data URL payload to Express
  try {
    const res = await fetch('/api/ephemeral/direct-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        fileSize,
        fileType,
        fileDataUrl
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.session && data.quickCode) {
        session = data.session;
        quickCode = data.quickCode;
      }
    }
  } catch (err) {
    console.warn('Express direct upload error:', err);
  }

  if (!session || !quickCode) {
    const now = Date.now();
    quickCode = generate4DigitCode();
    const sessionId = "dir_" + Math.random().toString(36).substring(2, 9);
    session = {
      id: sessionId,
      receiverMessage: "Trasferimento Diretto Veloce",
      receiverCode: "0000",
      receiverCodeCreatedAt: now,
      receiverCodeExpiresAt: now + 3 * 60 * 1000, // 3 minutes validity
      quickCode,
      fileName,
      fileSize,
      fileType,
      fileUrl: `/api/ephemeral/download/${sessionId}`,
      isEncrypted: false,
      status: 'unlocked',
      createdAt: now
    };
  }

  // Ensure full fileDataUrl is retained on memory session object
  session.fileDataUrl = fileDataUrl;

  // Sync session & file chunks to Firestore Cloud DB
  try {
    const sessionRef = doc(db, 'sessions', session.id);
    await setDoc(sessionRef, { ...session, fileDataUrl: fileDataUrl.length < 400000 ? fileDataUrl : '' });
    await saveFileToFirestore(session.id, fileDataUrl);
  } catch (e) {
    console.error('Error syncing session or file chunks to Firestore:', e);
  }

  saveOrUpdateLocalSession(session);
  return { session, quickCode };
}

export async function directLookupCode(quickCode: string): Promise<EphemeralSession> {
  const codeStr = quickCode ? quickCode.toString().replace(/\D/g, '') : '';
  if (!codeStr || codeStr.length !== 4) {
    throw new Error('Inserisci un codice di 4 cifre valido.');
  }

  // 1. Check Express backend
  try {
    const res = await fetch('/api/ephemeral/direct-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quickCode: codeStr })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.session) {
        if (!data.session.fileDataUrl) {
          const fetched = await getFileFromFirestore(data.session.id);
          if (fetched) data.session.fileDataUrl = fetched;
        }
        saveOrUpdateLocalSession(data.session);
        return data.session;
      }
    }
  } catch (err) {
    console.warn('Express direct lookup error:', err);
  }

  // 2. Query Firestore Cloud DB
  try {
    const sessionsRef = collection(db, 'sessions');
    const q = query(sessionsRef, where('quickCode', '==', codeStr));
    const querySnapshot = await getDocs(q);

    const matches: EphemeralSession[] = [];
    querySnapshot.forEach((d) => {
      const data = d.data() as EphemeralSession;
      if (data.status !== 'purged' && data.status !== 'expired' && data.status !== 'revoked') {
        matches.push(data);
      }
    });

    if (matches.length > 0) {
      const match = matches[0];
      if (!match.fileDataUrl) {
        const fetched = await getFileFromFirestore(match.id);
        if (fetched) match.fileDataUrl = fetched;
      }
      saveOrUpdateLocalSession(match);
      return match;
    }
  } catch (err) {
    console.error('Firestore direct lookup error:', err);
  }

  // 3. Fallback LocalStorage
  const localSessions = getLocalSessions();
  const match = localSessions.find(s => s.quickCode === codeStr && s.status !== 'purged');
  if (match) {
    if (!match.fileDataUrl) {
      const fetched = await getFileFromFirestore(match.id);
      if (fetched) match.fileDataUrl = fetched;
    }
    return match;
  }

  throw new Error('Codice non trovato o file già auto-distrutto.');
}

export function saveLocalSessions(sessions: EphemeralSession[]) {
  try {
    const sanitized = sessions.map(s => {
      const copy = { ...s };
      if (copy.fileDataUrl) {
        cacheClientFile(copy.id, copy.fileDataUrl);
        delete copy.fileDataUrl;
      }
      return copy;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('safehandshake_sync'));
  } catch (err) {
    console.warn('[STORAGE] Failed to save local session to localStorage:', err);
  }
}

export function saveOrUpdateLocalSession(session: EphemeralSession) {
  if (session.fileDataUrl) {
    cacheClientFile(session.id, session.fileDataUrl);
  }
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  if (index !== -1) {
    sessions[index] = { ...session };
  } else {
    sessions.push({ ...session });
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
  fileDataUrl: string,
  receiverCode?: string,
  donorCodeInput?: string
): Promise<{ session: EphemeralSession; donorCode: string }> {
  let updatedSession: EphemeralSession | null = null;
  let donorCode: string | null = donorCodeInput || null;

  // 1. Send to Express Server
  try {
    const res = await fetch('/api/ephemeral/donor-attach-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        fileName,
        fileSize,
        fileType,
        fileDataUrl,
        isEncrypted: true,
        receiverCode,
        donorCode: donorCodeInput
      })
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
    donorCodeExpiresAt: now + 3 * 60 * 1000,
    status: 'pending_receiver_unlock' as const
  };

  // 2. Save file chunks to Firestore Cloud DB
  try {
    await saveFileToFirestore(sessionId, fileDataUrl);
    const sessionRef = doc(db, 'sessions', sessionId);
    await updateDoc(sessionRef, {
      ...updateFields,
      fileDataUrl: fileDataUrl.length < 400000 ? fileDataUrl : ''
    });
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      const fsSession = snap.data() as EphemeralSession;
      if (!updatedSession) updatedSession = fsSession;
    }
  } catch (err) {
    console.error('[API] Firestore updateDoc error:', err);
  }

  if (updatedSession) {
    updatedSession.fileDataUrl = fileDataUrl;
  }

  // 3. Update LocalStorage
  const localSessions = getLocalSessions();
  const index = localSessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    const localUpdated: EphemeralSession = {
      ...localSessions[index],
      ...updateFields,
      fileDataUrl
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
    unlockedExpiresAt: now + 3 * 60 * 1000
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

  // 3. Ensure fileDataUrl is loaded from Firestore if missing
  if (unlockedSession && !unlockedSession.fileDataUrl) {
    const fetched = await getFileFromFirestore(sessionId);
    if (fetched) unlockedSession.fileDataUrl = fetched;
  }

  // 4. Local Fallback
  const localSessions = getLocalSessions();
  const index = localSessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    const s = localSessions[index];
    if (s.donorCode === codeStr || s.status === 'unlocked') {
      s.status = 'unlocked';
      s.unlockedAt = now;
      s.unlockedExpiresAt = now + 3 * 60 * 1000;
      if (!s.fileDataUrl && unlockedSession?.fileDataUrl) {
        s.fileDataUrl = unlockedSession.fileDataUrl;
      }
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

export async function confirmPurge(sessionId: string): Promise<void> {
  // 1. Express Server
  try {
    await fetch('/api/ephemeral/confirm-purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (e) {
    // ignore
  }

  // 2. Firestore Cloud DB purge (documents + chunks)
  await purgeFirestoreSession(sessionId);

  // 3. LocalStorage update
  const sessions = getLocalSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions[index].status = 'purged';
    delete sessions[index].fileDataUrl;
    delete sessions[index].fileUrl;
    saveLocalSessions(sessions);
  }
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
  await purgeFirestoreSession(sessionId);

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
        if (!data.session.fileDataUrl) {
          const fetched = await getFileFromFirestore(sessionId);
          if (fetched) data.session.fileDataUrl = fetched;
        }
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
      if (!data.fileDataUrl) {
        const fetched = await getFileFromFirestore(sessionId);
        if (fetched) data.fileDataUrl = fetched;
      }
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
    return onSnapshot(sessionRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data() as EphemeralSession;
        let fileData = getClientCachedFile(sessionId);
        if (!fileData && (data.status === 'unlocked' || data.status === 'pending_receiver_unlock')) {
          fileData = await getFileFromFirestore(sessionId);
        }
        if (fileData) {
          data.fileDataUrl = fileData;
        }
        saveOrUpdateLocalSession(data);
        callback(data);
      }
    });
  } catch (err) {
    console.warn('[API] Subscription error:', err);
    return () => {};
  }
}
