import React, { useState } from 'react';
import { 
  Zap, 
  Upload, 
  FileText, 
  CheckCircle2, 
  Download, 
  Trash2, 
  Copy, 
  Check, 
  ArrowRight, 
  AlertCircle,
  Building2,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { directUploadFile, directLookupCode, confirmPurge, donorRevoke, dataUrlToBlob, getFileFromFirestore } from '../services/apiService';
import { EphemeralSession } from '../types';
import { WebRTCService } from '../services/webrtcService';
import { db } from '../lib/firebase';
import { doc, onSnapshot, collection } from 'firebase/firestore';

export const QuickDirectTransfer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');

  // --- SEND STATE ---
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    name: string;
    size: string;
    type: string;
    previewUrl?: string;
  } | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadedSession, setUploadedSession] = useState<EphemeralSession | null>(null);
  const [generatedQuickCode, setGeneratedQuickCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTimer, setSendTimer] = useState<number>(180);
  const [sendP2pState, setSendP2pState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [sendWebrtc, setSendWebrtc] = useState<WebRTCService | null>(null);

  // --- RECEIVE STATE ---
  const [inputQuickCode, setInputQuickCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundSession, setFoundSession] = useState<EphemeralSession | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveTimer, setReceiveTimer] = useState<number>(180);
  const [receiveP2pState, setReceiveP2pState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [receiveWebrtc, setReceiveWebrtc] = useState<WebRTCService | null>(null);
  const [p2pFileData, setP2pFileData] = useState<string | null>(null);
  const [p2pProgress, setP2pProgress] = useState<number | null>(null);

  // Send P2P Signaling
  React.useEffect(() => {
    if (uploadedSession && !sendWebrtc) {
      const rtc = new WebRTCService();
      rtc.setConnectionStateChange((state) => {
        if (state === 'connected') setSendP2pState('connected');
        else if (state === 'connecting') setSendP2pState('connecting');
        else setSendP2pState('disconnected');
      });

      rtc.setOnMessage((msg) => {
        if (msg.type === 'request_file' && selectedFile) {
          // Need to read the file again or use cached dataUrl
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            rtc.sendFile(uploadedSession.id, dataUrl);
          };
          reader.readAsDataURL(selectedFile.file);
        }
      });

      rtc.createOffer(uploadedSession.id, 'donor');
      setSendWebrtc(rtc);
    }

    return () => {
      if (sendWebrtc && !uploadedSession) {
        sendWebrtc.close();
        setSendWebrtc(null);
      }
    };
  }, [uploadedSession?.id, sendWebrtc, selectedFile]);

  // Receive P2P Signaling
  React.useEffect(() => {
    let unsubscribeSignaling = () => {};

    if (foundSession && !receiveWebrtc && !downloadSuccess) {
      const rtc = new WebRTCService();
      rtc.setConnectionStateChange((state) => {
        if (state === 'connected') setReceiveP2pState('connected');
        else if (state === 'connecting') setReceiveP2pState('connecting');
        else setReceiveP2pState('disconnected');
      });

      rtc.setOnMessage((msg) => {
        if (msg.type === 'file_complete') {
          setP2pFileData(msg.data);
          setP2pProgress(null);
        } else if (msg.type === 'progress') {
          setP2pProgress(msg.progress);
        }
      });

      const unsubscribe = onSnapshot(doc(db, 'sessions', foundSession.id, 'signaling', 'offer'), (snapshot) => {
        const data = snapshot.data();
        if (data && data.type === 'offer') {
          rtc.handleOffer(foundSession.id, 'receiver', data.payload);
        }
      });
      unsubscribeSignaling = unsubscribe;
      setReceiveWebrtc(rtc);
    }

    return () => {
      unsubscribeSignaling();
      if (receiveWebrtc && (!foundSession || downloadSuccess)) {
        receiveWebrtc.close();
        setReceiveWebrtc(null);
      }
    };
  }, [foundSession?.id, receiveWebrtc, downloadSuccess]);

  // Request file via P2P once connected
  React.useEffect(() => {
    if (receiveP2pState === 'connected' && receiveWebrtc && !p2pFileData && foundSession && !isDownloading) {
      receiveWebrtc.send({ type: 'request_file' });
    }
  }, [receiveP2pState, receiveWebrtc, p2pFileData, foundSession, isDownloading]);

  // Send Timer Countdown Effect
  React.useEffect(() => {
    let timer: any = null;
    if (uploadedSession && sendTimer > 0) {
      timer = setInterval(() => {
        setSendTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [uploadedSession, sendTimer]);

  // Receive Timer Countdown Effect
  React.useEffect(() => {
    let timer: any = null;
    if (foundSession && receiveTimer > 0 && !downloadSuccess) {
      timer = setInterval(() => {
        setReceiveTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [foundSession, receiveTimer, downloadSuccess]);

  // Quota Exceeded Listener
  React.useEffect(() => {
    const handleQuota = () => {
      const msg = 'Limite giornaliero Firebase raggiunto. Il sistema cloud è temporaneamente disabilitato. Riprova più tardi.';
      setSendError(msg);
      setReceiveError(msg);
    };
    window.addEventListener('safehandshake_quota_exceeded', handleQuota);
    return () => window.removeEventListener('safehandshake_quota_exceeded', handleQuota);
  }, []);

  // Utility format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // Handle local File Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024 * 1024) {
      setSendError('Il file supera il limite massimo di 1 GB.');
      return;
    }

    setSendError(null);
    let previewUrl: string | undefined = undefined;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
    }

    setSelectedFile({
      file,
      name: file.name,
      size: formatSize(file.size),
      type: file.type,
      previewUrl
    });
  };

  // Perform Direct Upload
  const handleUploadDirect = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setSendError(null);

    try {
      // Read file data
      const reader = new FileReader();
      reader.onload = async (event) => {
        const fileContent = event.target?.result;
        if (!fileContent) {
          setSendError('Errore nella lettura del file.');
          setIsUploading(false);
          return;
        }

        try {
          const result = await directUploadFile(
            selectedFile.name,
            selectedFile.size,
            selectedFile.type,
            fileContent as string
          );

          setUploadedSession(result.session);
          setGeneratedQuickCode(result.quickCode);
          setSendTimer(180);
        } catch (err: any) {
          setSendError(err.message || 'Errore durante il caricamento del file.');
        } finally {
          setIsUploading(false);
        }
      };

      reader.readAsDataURL(selectedFile.file);
    } catch (err: any) {
      setSendError(err.message || 'Errore imprevisto.');
      setIsUploading(false);
    }
  };

  // Copy Code to Clipboard
  const handleCopyCode = () => {
    if (!generatedQuickCode) return;
    navigator.clipboard.writeText(generatedQuickCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Cancel/Revoke Uploaded File
  const handleCancelSend = async () => {
    if (uploadedSession) {
      await donorRevoke(uploadedSession.id);
    }
    setUploadedSession(null);
    setGeneratedQuickCode(null);
    setSelectedFile(null);
  };

  // Search File by Quick Code
  const handleSearchCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputQuickCode || inputQuickCode.trim().length !== 4) {
      setReceiveError('Inserisci un codice di 4 cifre.');
      return;
    }

    setIsSearching(true);
    setReceiveError(null);
    setFoundSession(null);

    try {
      const session = await directLookupCode(inputQuickCode.trim());
      setFoundSession(session);
      const elapsed = Math.floor((Date.now() - session.createdAt) / 1000);
      const remaining = Math.max(0, 180 - elapsed);
      setReceiveTimer(remaining);
    } catch (err: any) {
      setReceiveError(err.message || 'Codice non trovato, scaduto o file auto-distrutto.');
    } finally {
      setIsSearching(false);
    }
  };

  // Download Direct File & Purge
  const handleDownloadDirectFile = async () => {
    if (!foundSession) return;

    setIsDownloading(true);
    setReceiveError(null);

    try {
      let dataUrl = p2pFileData || foundSession.fileDataUrl;
      if (!dataUrl) {
        dataUrl = await getFileFromFirestore(foundSession.id);
      }

      if (dataUrl) {
        const blob = dataUrlToBlob(dataUrl);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = foundSession.fileName || 'documento';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const downloadUrl = foundSession.fileUrl || `/api/ephemeral/download/${foundSession.id}`;
        const response = await fetch(downloadUrl);

        if (!response.ok) {
          throw new Error('Impossibile scaricare il file. Potrebbe essere già stato rimosso.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = foundSession.fileName || 'documento';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      // Confirm Purge to wipe from server
      await confirmPurge(foundSession.id);
      setDownloadSuccess(true);
    } catch (err: any) {
      setReceiveError(err.message || 'Errore durante il download.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* HEADER BANNER */}
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30">
              <Zap className="w-5 h-5 fill-cyan-400/20" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
                <span>Invio Diretto Veloce</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Senza Cifratura
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ideale per documenti quotidiani (es. Carta d'Identità per la reception dell'Albergo).
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('send')}
              className={`px-3 py-1.5 rounded-xl transition ${
                activeTab === 'send'
                  ? 'bg-cyan-500 text-slate-950 font-extrabold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Invia File
            </button>
            <button
              onClick={() => setActiveTab('receive')}
              className={`px-3 py-1.5 rounded-xl transition ${
                activeTab === 'receive'
                  ? 'bg-cyan-500 text-slate-950 font-extrabold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ricevi / Scarica
            </button>
          </div>
        </div>

        {/* Info box for hotels/reception */}
        <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
          <Building2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-slate-300">
            <strong>Come funziona:</strong> Chi invia carica il documento e genera un <strong>Codice Veloce a 4 cifre</strong>. Chi riceve inserisce il codice e scarica subito il file. <span className="text-cyan-300 font-semibold">Appena scaricato, il file viene cancellato per sempre dal server.</span>
          </p>
        </div>
      </div>

      {/* ================= TAB 1: INVIA FILE DIRETTAMENTE ================= */}
      {activeTab === 'send' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
          {!uploadedSession ? (
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                Seleziona Documento o Immagine:
              </label>

              {/* Custom File Upload Box */}
              <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-950 rounded-2xl p-5 text-center transition space-y-3">
                {selectedFile ? (
                  <div className="space-y-3">
                    {selectedFile.previewUrl ? (
                      <img 
                        src={selectedFile.previewUrl} 
                        alt="Anteprima" 
                        className="w-24 h-24 object-cover rounded-2xl mx-auto border border-slate-700 shadow-md"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/30">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 truncate">{selectedFile.name}</h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{selectedFile.size}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Rimuovi e cambia file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <Upload className="w-8 h-8 text-slate-500 mx-auto" />
                    <div>
                      <p className="text-xs text-slate-300 font-medium">Tocca o trascina qui la Carta d'Identità o altro file</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Foto, PDF, Carta d'Identità (Fino a 1 GB)</p>
                    </div>
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="quick-direct-file-input"
                    />
                    <label
                      htmlFor="quick-direct-file-input"
                      className="inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer transition shadow-sm"
                    >
                      Sfoglia File...
                    </label>
                  </div>
                )}
              </div>

              {sendError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}

              {/* Upload Button */}
              {selectedFile && (
                <button
                  type="button"
                  onClick={handleUploadDirect}
                  disabled={isUploading}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-black rounded-2xl text-sm flex items-center justify-center space-x-2 transition transform active:scale-95 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Caricamento In Corso...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-slate-950" />
                      <span>CARICA E GENERA CODICE VELOCE</span>
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            /* SUCCESS STATE: SHOW QUICK CODE TO GIVE RECEIVER */
            <div className="space-y-5 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/40">
                <CheckCircle2 className="w-6 h-6 text-cyan-400" />
              </div>

              <div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-widest">
                  FILE PRONTO PER IL RICEVENTE
                </span>
                <h3 className="text-base font-extrabold text-slate-100 mt-2">
                  {uploadedSession.fileName}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{uploadedSession.fileSize}</p>
              </div>

              {/* Code Box */}
              <div className="p-5 rounded-2xl bg-slate-950 border-2 border-cyan-500/40 space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Ditta a voce o comunica questo codice al ricevente:
                </span>
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-cyan-300">
                    {generatedQuickCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 transition border border-slate-700"
                    title="Copia codice"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="pt-2 text-center space-y-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${sendTimer > 20 ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'}`}>
                    ⏱️ Scadenza Codice: {Math.floor(sendTimer / 60)}m {sendTimer % 60}s (3 min max)
                  </span>
                  
                  <div className={`flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider ${
                    sendP2pState === 'connected' ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    {sendP2pState === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                    <span>{sendP2pState === 'connected' ? 'Collegamento P2P Attivo' : 'In attesa di collegamento diretto...'}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200 text-left space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Trash2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Auto-Distruzione Zero-Trace:</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Appena il ricevente inserisce il codice e scarica il file, il documento verrà rimosso ed auto-distrutto per sempre dal server.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelSend}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-red-400 font-semibold rounded-xl text-xs transition border border-slate-700"
              >
                Annulla e Cancella File Ora
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: RICEVI E SCARICA FILE CON CODICE ================= */}
      {activeTab === 'receive' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
          {!foundSession ? (
            <form onSubmit={handleSearchCode} className="space-y-4">
              <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                Inserisci il Codice Veloce a 4 cifre:
              </label>

              <div className="flex space-x-2">
                <input
                  type="text"
                  maxLength={4}
                  value={inputQuickCode}
                  onChange={(e) => setInputQuickCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="es. 4821"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-2xl text-center text-xl font-mono font-black text-slate-100 placeholder:text-slate-600 focus:outline-none transition tracking-widest"
                />
                <button
                  type="submit"
                  disabled={isSearching || inputQuickCode.length !== 4}
                  className="px-5 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-2xl text-xs transition flex items-center space-x-1.5 shrink-0 disabled:opacity-40"
                >
                  {isSearching ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>TROVA</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {receiveError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{receiveError}</span>
                </div>
              )}
            </form>
          ) : downloadSuccess ? (
            /* DOWNLOAD COMPLETED & PURGED SUCCESS STATE */
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-emerald-400">
                  File Scaricato con Successo!
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Il file è stato eliminato ed auto-distrutto per sempre dal server. Zero tracce sul web.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFoundSession(null);
                  setDownloadSuccess(false);
                  setInputQuickCode('');
                }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
              >
                Ricevi un altro file
              </button>
            </div>
          ) : (
            /* FILE FOUND: SHOW DOWNLOAD BUTTON */
            <div className="space-y-5 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/30">
                <FileText className="w-6 h-6" />
              </div>

              <div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-widest">
                  DOCUMENTO DISPONIBILE
                </span>
                <h3 className="text-base font-black text-slate-100 mt-2">
                  {foundSession.fileName}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{foundSession.fileSize}</p>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${receiveTimer > 20 ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'}`}>
                    ⏱️ Scade tra: {Math.floor(receiveTimer / 60)}m {receiveTimer % 60}s
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 text-left space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                  <Trash2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Avviso di Distruzione Istantanea:</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Al click sul pulsante di download, il file verrà scaricato sul tuo dispositivo ed eliminato per sempre dal server contemporaneamente.
                </p>
              </div>

              {receiveError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{receiveError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleDownloadDirectFile}
                disabled={isDownloading || (receiveP2pState === 'connected' && !p2pFileData && !foundSession.fileDataUrl)}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-black rounded-2xl text-sm flex items-center justify-center space-x-2 transition transform active:scale-95 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Download ed Eliminazione in corso...</span>
                  </>
                ) : (receiveP2pState === 'connected' && !p2pFileData && !foundSession.fileDataUrl) ? (
                  <>
                    <Wifi className="w-4 h-4 animate-pulse" />
                    <span>RICEZIONE P2P ({p2pProgress || 0}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>SCARICA E DISTRUGGI ORA</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
