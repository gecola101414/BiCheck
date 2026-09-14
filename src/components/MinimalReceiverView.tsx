import React, { useState, useEffect } from 'react';
import { Clock, Download, AlertCircle, RefreshCw, CheckCircle2, MessageSquare, ArrowRight, Lock, Trash2, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { EphemeralSession } from '../types';
import { requestReceiverCode, receiverUnlock, confirmPurge, fetchSessionStatus, subscribeToSession, getFileFromFirestore } from '../services/apiService';
import { decryptPayload } from '../lib/crypto';
import { WebRTCService } from '../services/webrtcService';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export const MinimalReceiverView: React.FC = () => {
  const [customMessage, setCustomMessage] = useState('Ciao! Mi mandi il tuo documento di identità per la registrazione Hotel?');
  const [session, setSession] = useState<EphemeralSession | null>(null);
  const [donorCodeInput, setDonorCodeInput] = useState('');
  
  const [receiverTimer, setReceiverTimer] = useState<number>(180);
  const [unlockedTimer, setUnlockedTimer] = useState<number>(180);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPurged, setIsPurged] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [webrtc, setWebrtc] = useState<WebRTCService | null>(null);
  const [p2pState, setP2pState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [p2pFileData, setP2pFileData] = useState<string | null>(null);
  const [p2pProgress, setP2pProgress] = useState<number | null>(null);

  // WebRTC Setup
  useEffect(() => {
    let unsubscribeSignaling = () => {};

    if (session && session.id && (session.status === 'pending_receiver_unlock' || session.status === 'unlocked') && !webrtc) {
      console.log('[WebRTC] Receiver listening for P2P offer...');
      const rtc = new WebRTCService();
      
      rtc.setConnectionStateChange((state) => {
        if (state === 'connected') setP2pState('connected');
        else if (state === 'connecting') setP2pState('connecting');
        else setP2pState('disconnected');
      });

      rtc.setOnMessage((msg) => {
        if (msg.type === 'file_complete') {
          console.log('[WebRTC] File data received via P2P!');
          setP2pFileData(msg.data);
          setP2pProgress(null);
        } else if (msg.type === 'progress') {
          setP2pProgress(msg.progress);
        }
      });

      // Check for offer in Firestore
      const checkOffer = async () => {
        // Signaling subcollection listener
        const unsubscribe = onSnapshot(doc(db, 'sessions', session.id, 'signaling', 'offer'), (snapshot) => {
          const data = snapshot.data();
          if (data && data.type === 'offer') {
            console.log('[WebRTC] Offer found, answering...');
            rtc.handleOffer(session.id, 'receiver', data.payload);
          }
        });
        unsubscribeSignaling = unsubscribe;
      };
      
      checkOffer();
      setWebrtc(rtc);
    }

    return () => {
      unsubscribeSignaling();
      if (webrtc && (!session || session.status === 'purged' || session.status === 'revoked')) {
        webrtc.close();
        setWebrtc(null);
      }
    };
  }, [session?.id, session?.status]);

  // If session is unlocked and P2P is connected, request the file automatically
  useEffect(() => {
    if (session?.status === 'unlocked' && p2pState === 'connected' && webrtc && !p2pFileData && !isLoading) {
      console.log('[WebRTC] Requesting file via P2P...');
      webrtc.send({ type: 'request_file' });
    }
  }, [session?.status, p2pState, webrtc, p2pFileData, isLoading]);

  useEffect(() => {
    const handleQuota = () => {
      setQuotaExceeded(true);
      setErrorMsg('Attenzione: Quota cloud esaurita. Il sistema sta usando i fallback serverless.');
    };
    window.addEventListener('safehandshake_quota_exceeded', handleQuota);
    return () => window.removeEventListener('safehandshake_quota_exceeded', handleQuota);
  }, []);

  const presets = [
    "Ciao! Mi mandi il documento per il check-in Hotel?",
    "Salve! Mi invii la patente per il noleggio auto?",
    "Buongiorno, ho bisogno del codice fiscale per la ricevuta."
  ];

  // Real-time Firestore subscription & polling backup
  useEffect(() => {
    if (!session || session.status === 'unlocked' || session.status === 'revoked' || session.status === 'expired' || session.status === 'purged') {
      return;
    }
    const unsubscribe = subscribeToSession(session.id, (latestSession) => {
      if (latestSession) {
        setSession(latestSession);
      }
    });

    const interval = setInterval(async () => {
      try {
        const latestSession = await fetchSessionStatus(session.id);
        if (latestSession) {
          setSession(latestSession);
        }
      } catch (e) {
        // ignore
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [session?.id]);

  // Timer Countdown
  useEffect(() => {
    let timer: any = null;
    if (session && (session.status === 'pending_donor_upload' || session.status === 'pending_receiver_unlock')) {
      timer = setInterval(() => {
        setReceiverTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (session && session.status === 'unlocked' && unlockedTimer > 0) {
      timer = setInterval(() => {
        setUnlockedTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session, unlockedTimer]);

  // Step 1: Create request
  const handleCreateRequest = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setIsPurged(false);
    try {
      const newSession = await requestReceiverCode(customMessage);
      setSession(newSession);
      setReceiverTimer(180);
      setDonorCodeInput('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore durante la generazione del codice');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Unlock with Donor Code
  const handleUnlock = async () => {
    if (!session || donorCodeInput.length !== 4) {
      setErrorMsg('Inserisci il Codice Donatore di 4 cifre.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const unlockedSession = await receiverUnlock(session.id, donorCodeInput.trim());
      setSession(unlockedSession);
      setUnlockedTimer(180);
    } catch (err: any) {
      setErrorMsg(err.message || 'Codice errato o scaduto.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fail-safe PDF & File Download trigger with E2EE Decryption and Instant Purge AFTER download
  const handleDownloadFile = async () => {
    if (!session) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      let rawDataUrl = p2pFileData || session.fileDataUrl;

      // 1. Fetch from Firestore chunks if inline payload is empty and no P2P data
      if (!rawDataUrl) {
        rawDataUrl = (await getFileFromFirestore(session.id)) || '';
      }

      // 2. Fallback fetch from Express download endpoint
      if (!rawDataUrl) {
        const downloadUrl = session.fileUrl || `/api/ephemeral/download/${session.id}`;
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          throw new Error('File non disponibile, già auto-distrutto o scaduto dal server.');
        }
        rawDataUrl = await res.text();
      }

      // 2. Decrypt payload client-side with E2EE key (ReceiverCode + DonorCode)
      const decryptedDataUrl = await decryptPayload(
        rawDataUrl,
        session.receiverCode,
        donorCodeInput.trim() // Use the actual input to avoid any state delay
      );

      // 3. Convert Data URL or text directly to Blob in browser memory
      let blob: Blob;
      if (decryptedDataUrl.includes('base64,')) {
        const parts = decryptedDataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || session.fileType || 'application/pdf';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        blob = new Blob([decryptedDataUrl], { type: session.fileType || 'text/plain' });
      }

      // 4. Trigger client-side browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = session.fileName || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);

      // 5. NOW call confirmPurge on server and Firestore AFTER successful download!
      await confirmPurge(session.id);
      setIsPurged(true);
      setSession(prev => prev ? { ...prev, status: 'purged' } : null);
    } catch (err: any) {
      console.error('[Download Error]', err);
      setErrorMsg(err.message || 'Errore durante la decifratura o download del file.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 font-sans px-1 sm:px-0">
      {/* View Title with GecolaShare & 2026@AETERNA branding */}
      <div className="text-center space-y-1">
        <span className="text-[10px] sm:text-[11px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 inline-block">
          Console Ricevente (Hotel / Ente)
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center justify-center gap-2">
          <span>Richiedi Documento</span>
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
        </h2>
        <span className="text-xs font-black text-emerald-400 font-mono block">2026@AETERNA</span>
        <p className="text-[11px] sm:text-xs text-slate-400">Genera il codice a 4 cifre e dettalo a voce al cliente.</p>
      </div>

      {/* STEP 1 FORM */}
      {(!session || session.status === 'expired' || session.status === 'revoked' || session.status === 'purged' || isPurged) && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          {isPurged && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center space-x-2">
              <Trash2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>AUTO-DISTRUZIONE COMPLETATA:</strong> Il file è stato scaricato ed eliminato istantaneamente dal server. Zero tracce rimaste!</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Messaggio Personalizzato di Richiesta:</span>
            </label>
            <textarea
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Scrivi qui il messaggio per il cliente..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Quick Preset Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Messaggi Rapidi:</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCustomMessage(p)}
                  className="text-[11px] px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 text-left transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateRequest}
            disabled={isLoading}
            className="w-full py-3.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-2 active:scale-95"
          >
            {isLoading ? (
              <span>Generazione...</span>
            ) : (
              <>
                <span className="truncate">Genera Codice Ricevente (4 Cifre)</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </>
            )}
          </button>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 & 3: DISPLAY RECEIVER CODE & ENTER DONOR CODE */}
      {session && !isPurged && (session.status === 'pending_donor_upload' || session.status === 'pending_receiver_unlock') && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 text-center">
          {/* Receiver Code Display */}
          <div className="space-y-2 border-b border-slate-800 pb-4">
            <span className="text-xs text-slate-400 block font-medium">Il tuo Codice Ricevente (Dillo a voce al cliente):</span>
            <div className="inline-block max-w-full text-3xl sm:text-5xl font-mono font-black text-emerald-400 bg-slate-950 px-5 sm:px-8 py-3.5 rounded-2xl sm:rounded-3xl border-2 border-emerald-500/50 shadow-inner tracking-[0.25em] sm:tracking-[0.4em]">
              {session.receiverCode}
            </div>
            <div className="flex items-center justify-center space-x-2 text-xs text-amber-400 mt-2">
              <Clock className="w-4 h-4 animate-spin shrink-0" />
              <span>Scadenza Codice:</span>
              <span className="font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {Math.floor(receiverTimer / 60)}:{(receiverTimer % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Status Message */}
          {session.status === 'pending_donor_upload' && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-center space-x-2 text-xs font-semibold text-amber-400">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>In attesa che il cliente invii il file col codice {session.receiverCode}...</span>
              </div>
            </div>
          )}

          {/* Donor Code Entry */}
          {session.status === 'pending_receiver_unlock' && (
            <div className="space-y-4 text-left">
              <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Il cliente ha caricato il file cifrato! Chiedigli il <strong>Codice Donatore (4 cifre)</strong>.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">Inserisci Codice Donatore (4 cifre):</label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Es. 9988"
                    value={donorCodeInput}
                    onChange={(e) => setDonorCodeInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full sm:flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-center text-2xl sm:text-3xl font-mono font-bold text-emerald-300 tracking-[0.3em] sm:tracking-[0.4em] focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleUnlock}
                    disabled={isLoading || donorCodeInput.length !== 4}
                    className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 whitespace-nowrap active:scale-95"
                  >
                    {isLoading ? 'Sblocco...' : 'Sblocca File'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2 text-left">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <div className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border mb-3 ${
              p2pState === 'connected' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : p2pState === 'connecting'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              {p2pState === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-bold uppercase">
                {p2pState === 'connected' ? 'P2P Attivo' : p2pState === 'connecting' ? 'P2P in corso...' : 'P2P Offline'}
              </span>
            </div>
            <button
              onClick={() => setSession(null)}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Annulla Richiesta
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 UNLOCKED FILE DOWNLOAD & DECIPHER */}
      {session && !isPurged && session.status === 'unlocked' && (
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 text-center">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>

          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center justify-center gap-1 max-w-fit mx-auto">
              <Lock className="w-3 h-3" />
              <span>FILE E2EE PRONTO PER IL DOWNLOAD</span>
            </span>
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-100 mt-2 truncate">{session.fileName || 'documento.pdf'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Dimensione: {session.fileSize || '1.2 MB'}</p>
          </div>

          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-1 text-left">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Zero-Trace Auto-Destruzione:</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Al primo click sul pulsante di download, il file verrà decifrato e scaricato sul tuo computer. Contestualmente verrà <strong>eliminato ed auto-distrutto per sempre</strong> dal server.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleDownloadFile}
              disabled={isLoading || (p2pState === 'connected' && !p2pFileData && session.status === 'unlocked' && !session.fileDataUrl)}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl shadow-emerald-500/20 transition transform active:scale-95 text-center break-words disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {isLoading 
                  ? 'DECIFRATURA AES-256 E DOWNLOAD...' 
                  : (p2pState === 'connected' && !p2pFileData && !session.fileDataUrl)
                  ? `RICEZIONE P2P (${p2pProgress || 0}%)...`
                  : 'DECIFRA E SCARICA ORA'
                }
              </span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2 text-left">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* REVOKED STATE */}
      {session && session.status === 'revoked' && (
        <div className="bg-slate-900 border border-red-500/50 rounded-3xl p-5 sm:p-6 shadow-xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-red-300">COLLEGAMENTO INTERROTTO DAL DONATORE</h3>
          <p className="text-xs text-slate-400">Il proprietario del file ha annullato il trasferimento ed i dati sono stati eliminati.</p>
          <button
            onClick={() => setSession(null)}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl"
          >
            Nuova Richiesta
          </button>
        </div>
      )}
    </div>
  );
};
