import { EphemeralSession, SharedFolder, SharedFile } from '../types';
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

let firestoreDisabledUntil = 0;
const FIRESTORE_TIMEOUT = 8000; // Increased for chunked uploads

async function wrapFirestore<T>(promise: Promise<T>, fallbackValue: T): Promise<T> {
  if (Date.now() < firestoreDisabledUntil) {
    return fallbackValue;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[FIRESTORE] Operation timed out, using fallback.');
      resolve(fallbackValue);
    }, FIRESTORE_TIMEOUT);

    promise
      .then((val) => {
        clearTimeout(timeout);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (err.message?.includes('quota') || err.code === 'resource-exhausted') {
          console.error('[FIRESTORE] Quota exceeded. Disabling Firestore for 5 minutes.');
          firestoreDisabledUntil = Date.now() + 5 * 60 * 1000;
          window.dispatchEvent(new CustomEvent('safehandshake_quota_exceeded'));
        }
        resolve(fallbackValue);
      });
  });
}

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

export async function saveFileToFirestore(_sessionId: string, _fileDataUrl: string): Promise<void> {
  // Files are stored securely on the Express server disk and cached in memory.
  // We avoid writing heavy file chunks to Firestore to prevent daily quota exhaustion.
  return;
}

export async function getFileFromFirestore(sessionId: string): Promise<string | null> {
  const cached = getClientCachedFile(sessionId);
  if (cached) return cached;

  return wrapFirestore(
    (async () => {
      const sessionRef = doc(db, 'sessions', sessionId);
      const snap = await getDoc(sessionRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data.fileDataUrl && data.fileDataUrl.length > 50) {
          cacheClientFile(sessionId, data.fileDataUrl);
          return data.fileDataUrl;
        }
        
        // Try fetching chunks if inline data is missing
        const chunksRef = collection(db, 'sessions', sessionId, 'chunks');
        const chunkSnap = await getDocs(chunksRef);
        if (!chunkSnap.empty) {
          const chunks = chunkSnap.docs.map(d => d.data() as { data: string, index: number });
          chunks.sort((a, b) => a.index - b.index);
          const fullData = chunks.map(c => c.data).join('');
          cacheClientFile(sessionId, fullData);
          return fullData;
        }
      }
      return null;
    })(),
    null
  );
}

export async function purgeFirestoreSession(sessionId: string): Promise<void> {
  clearClientCachedFile(sessionId);
  wrapFirestore(
    (async () => {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        status: 'purged',
        purgedAt: Date.now(),
        fileDataUrl: '',
        fileUrl: ''
      }).catch(() => {});
      
      // Delete chunks
      const chunksRef = collection(db, 'sessions', sessionId, 'chunks');
      const chunkSnap = await getDocs(chunksRef);
      chunkSnap.forEach(async (d) => {
        await deleteDoc(d.ref).catch(() => {});
      });
    })(),
    null
  ).catch(() => {});
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

  // Sync session metadata to Firestore Cloud DB if available
  const sessionRef = doc(db, 'sessions', session.id);
  wrapFirestore(setDoc(sessionRef, { ...session, fileDataUrl: '' }), null).catch(() => {});

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
  let sessionFromFS: EphemeralSession | null = null;
  await wrapFirestore(
    (async () => {
      const sessionsRef = collection(db, 'sessions');
      const q = query(sessionsRef, where('quickCode', '==', codeStr));
      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((d) => {
        const data = d.data() as EphemeralSession;
        if (data.status !== 'purged' && data.status !== 'expired' && data.status !== 'revoked') {
          const fetchedData = { ...data };
          saveOrUpdateLocalSession(fetchedData);
          if (!sessionFromFS) sessionFromFS = fetchedData;
        }
      });
    })(),
    null
  );

  if (sessionFromFS) return sessionFromFS;

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
    
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.session) {
        createdSession = data.session;
      }
    } else {
      console.warn('[API] Express server returned error status:', res.status);
    }
  } catch (err) {
    console.warn('[API] Express server call network error:', err);
  }

  // Fallback generation (Serverless-ready)
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
  const sessionRef = doc(db, 'sessions', createdSession.id);
  await wrapFirestore(setDoc(sessionRef, createdSession), null);

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
  let sessionFromFS: EphemeralSession | null = null;
  await wrapFirestore(
    (async () => {
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
        sessionFromFS = target;
      }
    })(),
    null
  );

  if (sessionFromFS) return sessionFromFS;

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
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.session && data.donorCode) {
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

  // 2. Sync session metadata to Firestore Cloud DB
  const sessionRef = doc(db, 'sessions', sessionId);
  await wrapFirestore(
    (async () => {
      // In stateless/serverless mode, we must include the file data in Firestore
      // as there is no persistent disk store.
      const isLarge = fileDataUrl.length >= 800000;
      const safeDataUrl = isLarge ? '' : fileDataUrl;

      await updateDoc(sessionRef, {
        ...updateFields,
        fileDataUrl: safeDataUrl 
      }).catch(async () => {
        await setDoc(sessionRef, { 
          ...updateFields, 
          id: sessionId, 
          fileDataUrl: safeDataUrl 
        }, { merge: true }).catch(() => {});
      });

      // Handle chunking for large files
      if (isLarge) {
        const chunkSize = 800000;
        const totalChunks = Math.ceil(fileDataUrl.length / chunkSize);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = fileDataUrl.substring(i * chunkSize, (i + 1) * chunkSize);
          const chunkRef = doc(db, 'sessions', sessionId, 'chunks', `chunk_${i}`);
          await setDoc(chunkRef, { data: chunk, index: i });
        }
      }

      const snap = await getDoc(sessionRef).catch(() => null);
      if (snap && snap.exists()) {
        const fsSession = snap.data() as EphemeralSession;
        if (!updatedSession) updatedSession = fsSession;
      }
    })(),
    null
  );

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
  await wrapFirestore(
    (async () => {
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
    })(),
    null
  ).catch((err: any) => {
    if (err.message && err.message.includes('Codice donatore errato')) {
      throw err;
    }
  });

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
  // 1. Express Server (Primary)
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

  // 2. Firestore (Secondary, wrapped with timeout)
  return wrapFirestore(
    (async () => {
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
      return null;
    })(),
    null
  ).catch(() => {
    // 3. Local (Fallback)
    const sessions = getLocalSessions();
    return sessions.find(s => s.id === sessionId) || null;
  });
}

export function subscribeToSession(sessionId: string, callback: (session: EphemeralSession) => void) {
  let isUnsubscribed = false;
  let pollInterval: any = null;

  const handleCallback = (session: EphemeralSession) => {
    if (!isUnsubscribed) {
      callback(session);
    }
  };

  // 1. Initial Load from multiple sources
  fetchSessionStatus(sessionId).then(s => {
    if (s) handleCallback(s);
  });

  // 2. Setup Polling as primary fallback (especially for quota exceeded)
  pollInterval = setInterval(async () => {
    if (isUnsubscribed) return;
    // Only poll if Firestore is disabled or fails
    if (Date.now() < firestoreDisabledUntil) {
      const session = await fetchSessionStatus(sessionId);
      if (session) handleCallback(session);
    }
  }, 10000);

  // 3. Firestore Listener (if quota allows)
  let unsubscribeFirestore = () => {};
  if (Date.now() > firestoreDisabledUntil) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      unsubscribeFirestore = onSnapshot(
        sessionRef,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data() as EphemeralSession;
            let fileData = getClientCachedFile(sessionId);
            if (fileData) {
              data.fileDataUrl = fileData;
            }
            saveOrUpdateLocalSession(data);
            handleCallback(data);
          }
        },
        (err) => {
          console.warn('[FIRESTORE REALTIME SYNC] Using Express API fallback:', err.message);
          if (err.message?.includes('quota') || err.code === 'resource-exhausted') {
            firestoreDisabledUntil = Date.now() + 5 * 60 * 1000;
          }
        }
      );
    } catch (err) {
      console.warn('[API] Subscription error:', err);
    }
  }

  return () => {
    isUnsubscribed = true;
    if (pollInterval) clearInterval(pollInterval);
    unsubscribeFirestore();
  };
}

// ==================== SHARED FOLDER SERVICE ====================

export async function createSharedFolder(): Promise<SharedFolder | null> {
  const now = Date.now();
  const id = "fol_" + Math.random().toString(36).substring(2, 9);
  const code = generate4DigitCode();
  const fallbackFolder: SharedFolder = {
    id,
    code,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
    files: [],
    status: 'active'
  };

  try {
    const res = await fetch('/api/folder/create', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const folder = data.folder as SharedFolder;
      // Sync to Firestore for real-time
      const folderRef = doc(db, 'folders', folder.id);
      await wrapFirestore(setDoc(folderRef, folder), null);
      return folder;
    }
  } catch (err) {
    console.warn('[API] Folder server create failed, using client fallback:', err);
  }

  // Client-side fallback (Stateless/Serverless)
  const folderRef = doc(db, 'folders', fallbackFolder.id);
  await wrapFirestore(setDoc(folderRef, fallbackFolder), null);
  return fallbackFolder;
}

export async function joinSharedFolder(code: string): Promise<SharedFolder | null> {
  // 1. Check Server
  try {
    const res = await fetch('/api/folder/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.success) {
      return data.folder as SharedFolder;
    }
  } catch (err) {
    // ignore
  }

  // 2. Check Firestore
  return wrapFirestore(
    (async () => {
      const foldersRef = collection(db, 'folders');
      const q = query(foldersRef, where('code', '==', code.trim()), where('status', '==', 'active'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data() as SharedFolder;
      }
      return null;
    })(),
    null
  );
}

export async function addFileToSharedFolder(folderId: string, file: File, dataUrl: string, donorId: string): Promise<boolean> {
  const fileId = "file_" + Math.random().toString(36).substring(2, 9);
  const fileEntry: SharedFile = {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: Date.now(),
    donorId
  };

  try {
    const res = await fetch(`/api/folder/${folderId}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        type: file.type,
        fileDataUrl: dataUrl,
        donorId,
        fileId // Send local ID to server
      })
    });
    
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      // Sync to Firestore using the confirmed file list from server
      const folderRef = doc(db, 'folders', folderId);
      await wrapFirestore(updateDoc(folderRef, { files: data.folder.files }), null);
    } else {
      throw new Error(data.error || 'Server rejected upload or size limit hit');
    }
  } catch (err) {
    console.warn('[API] Folder server upload failed (likely Vercel size limit or disk error), using direct cloud sync:', err);
    
    // Stateless Fallback: Update Firestore list directly
    const folderRef = doc(db, 'folders', folderId);
    const snap = await wrapFirestore(getDoc(folderRef), null);
    if (snap && snap.exists()) {
      const currentFolder = snap.data() as SharedFolder;
      if (currentFolder.files.length < 5) {
        const updatedFiles = [...currentFolder.files, { ...fileEntry, fileDataUrl: dataUrl.length < 800000 ? dataUrl : '' }];
        await wrapFirestore(updateDoc(folderRef, { files: updatedFiles }), null);
      }
    } else {
      // Return false only if we are absolutely sure we can't even reach Firestore (quota/offline)
      if (Date.now() < firestoreDisabledUntil) return false;
    }
  }

  // Always save chunks for large files using the consistent fileId
  if (dataUrl.length >= 800000) {
    try {
      const chunkSize = 800000;
      const totalChunks = Math.ceil(dataUrl.length / chunkSize);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = dataUrl.substring(i * chunkSize, (i + 1) * chunkSize);
        const chunkRef = doc(db, 'folders', folderId, 'file_chunks', `${fileId}_${i}`);
        await wrapFirestore(setDoc(chunkRef, { data: chunk, index: i, fileId }), null);
      }
    } catch (err) {
      console.error('[API] Error saving chunks to Firestore:', err);
      return false;
    }
  }

  return true;
}

export async function removeFileFromSharedFolder(folderId: string, fileId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/folder/${folderId}/file/${fileId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      // Update Firestore
      const folderRef = doc(db, 'folders', folderId);
      const snap = await wrapFirestore(getDoc(folderRef), null);
      if (snap && snap.exists()) {
        const folder = snap.data() as SharedFolder;
        const newFiles = folder.files.filter(f => f.id !== fileId);
        await wrapFirestore(updateDoc(folderRef, { files: newFiles }), null);
      }

      // Delete chunks from Firestore
      const chunksRef = collection(db, 'folders', folderId, 'file_chunks');
      const q = query(chunksRef, where('fileId', '==', fileId));
      const chunkSnap = await getDocs(q);
      chunkSnap.forEach(async (d) => {
        await deleteDoc(d.ref).catch(() => {});
      });

      return true;
    }
  } catch (err) {
    // ignore
  }
  return false;
}

export async function fetchFileChunks(folderId: string, fileId: string): Promise<string | null> {
  return wrapFirestore(
    (async () => {
      const chunksRef = collection(db, 'folders', folderId, 'file_chunks');
      const q = query(chunksRef, where('fileId', '==', fileId));
      const snap = await getDocs(q);
      if (snap.empty) return null;

      const chunks = snap.docs.map(d => d.data() as { data: string, index: number });
      chunks.sort((a, b) => a.index - b.index);
      return chunks.map(c => c.data).join('');
    })(),
    null
  );
}

export function subscribeToSharedFolder(folderId: string, callback: (folder: SharedFolder) => void) {
  let isUnsubscribed = false;
  let pollInterval: any = null;

  const handleCallback = (folder: SharedFolder) => {
    if (!isUnsubscribed) callback(folder);
  };

  // 1. Server Polling (Fallback)
  pollInterval = setInterval(async () => {
    if (Date.now() < firestoreDisabledUntil) {
      try {
        const res = await fetch(`/api/folder/${folderId}/status`);
        const data = await res.json();
        if (data.success) handleCallback(data.folder);
      } catch (e) {}
    }
  }, 10000);

  // 2. Firestore Real-time
  let unsubscribeFS = () => {};
  if (Date.now() > firestoreDisabledUntil) {
    try {
      const folderRef = doc(db, 'folders', folderId);
      unsubscribeFS = onSnapshot(folderRef, (snap) => {
        if (snap.exists()) {
          handleCallback(snap.data() as SharedFolder);
        }
      }, (err) => {
        if (err.message?.includes('quota') || err.code === 'resource-exhausted') {
          firestoreDisabledUntil = Date.now() + 5 * 60 * 1000;
        }
      });
    } catch (err) {}
  }

  return () => {
    isUnsubscribed = true;
    if (pollInterval) clearInterval(pollInterval);
    unsubscribeFS();
  };
}
