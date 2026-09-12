import React, { useState, useEffect } from 'react';
import { Smartphone, Upload, CheckCircle2, Clock, AlertCircle, XCircle, Copy, Check, FileText } from 'lucide-react';
import { EphemeralSession } from '../types';
import { donorLoadRequest, donorAttachFile, donorRevoke, fetchSessionStatus, subscribeToSession } from '../services/apiService';

export const MinimalDonorView: React.FC = () => {
  const [receiverCodeInput, setReceiverCodeInput] = useState('');
  const [session, setSession] = useState<EphemeralSession | null>(null);
  const [donorCode, setDonorCode] = useState<string | null>(null);
  const [donorTimer, setDonorTimer] = useState<number>(900);

  // File Upload state
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: string;
    type: string;
    dataUrl: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Real-time Firestore subscription & polling backup
  useEffect(() => {
    if (!session || session.status === 'revoked' || session.status === 'expired') {
      return;
    }
    const unsubscribe = subscribeToSession(session.id, (latest) => {
      if (latest) {
        setSession(latest);
      }
    });

    const interval = setInterval(async () => {
      try {
        const latest = await fetchSessionStatus(session.id);
        if (latest) {
          setSession(latest);
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

  // Donor Code Timer
  useEffect(() => {
    let timer: any = null;
    if (donorCode && donorTimer > 0 && session?.status === 'pending_receiver_unlock') {
      timer = setInterval(() => {
        setDonorTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [donorCode, donorTimer, session]);

  // Step 2: Load Request from Receiver Code
  const handleLoadRequest = async () => {
    if (!receiverCodeInput || receiverCodeInput.length !== 4) {
      setErrorMsg('Inserisci un codice ricevente di 4 cifre valido.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const loadedSession = await donorLoadRequest(receiverCodeInput.trim());
      setSession(loadedSession);
    } catch (err: any) {
      setErrorMsg(err.message || 'Codice invalido.');
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle local File Upload / Selection (supports up to 500 MB)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024 * 1024) {
      setErrorMsg('Il file supera il limite massimo di 500 MB per la versione gratuita.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;

      // Smart optimization for smartphone camera photos to preserve clarity while ensuring instant upload
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const maxDim = 2048; // Crisp 2K resolution for reading document details
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressedDataUrl = canvas.toDataURL(file.type || 'image/jpeg', 0.88);
              setSelectedFile({
                name: file.name,
                size: (compressedDataUrl.length * 0.75 / 1024).toFixed(0) + ' KB',
                type: file.type || 'image/jpeg',
                dataUrl: compressedDataUrl
              });
              return;
            }
          }
          setSelectedFile({
            name: file.name,
            size: (file.size / 1024).toFixed(0) + ' KB',
            type: file.type || 'image/jpeg',
            dataUrl
          });
        };
        img.onerror = () => {
          setSelectedFile({
            name: file.name,
            size: (file.size / 1024).toFixed(0) + ' KB',
            type: file.type || 'image/jpeg',
            dataUrl
          });
        };
        img.src = dataUrl;
      } else {
        setSelectedFile({
          name: file.name,
          size: file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : (file.size / 1024).toFixed(0) + ' KB',
          type: file.type || 'application/octet-stream',
          dataUrl
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Quick preset sample document selection if user doesn't upload a file
  const handleUsePresetDocument = () => {
    const mockImageSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250" fill="%230f172a"><rect width="400" height="250" rx="20" fill="%230f172a" stroke="%231e293b" stroke-width="4"/><text x="30" y="50" fill="%2314b8a6" font-size="20" font-family="sans-serif" font-weight="bold">CARTA D'IDENTITÀ ITALIANA</text><text x="30" y="90" fill="%23e2e8f0" font-size="16" font-family="sans-serif">Cognome: Rossi</text><text x="30" y="120" fill="%23e2e8f0" font-size="16" font-family="sans-serif">Nome: Mario</text><text x="30" y="150" fill="%23e2e8f0" font-size="16" font-family="sans-serif">Codice Fiscale: RSSMRA88R15F205Z</text><text x="30" y="180" fill="%23e2e8f0" font-size="16" font-family="sans-serif">Scadenza: 10/05/2032</text><rect x="280" y="70" width="90" height="110" rx="10" fill="%231e293b"/><text x="300" y="130" fill="%2364748b" font-size="12" font-family="sans-serif">FOTO</text></svg>`;
    
    setSelectedFile({
      name: 'carta_identita_mario_rossi.png',
      size: '420 KB',
      type: 'image/png',
      dataUrl: mockImageSvg
    });
  };

  // Step 3: Attach File & Generate Donor Code
  const handleAttachAndAuthorize = async () => {
    if (!session || !selectedFile) {
      setErrorMsg('Seleziona o carica prima un file.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await donorAttachFile(
        session.id,
        selectedFile.name,
        selectedFile.size,
        selectedFile.type,
        selectedFile.dataUrl
      );

      setSession(result.session);
      setDonorCode(result.donorCode);
      setDonorTimer(900);
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore durante l\'autorizzazione.');
    } finally {
      setIsLoading(false);
    }
  };

  // KILL SWITCH: Revoke connection immediately
  const handleRevoke = async () => {
    if (!session) return;
    try {
      await donorRevoke(session.id);
      setSession(prev => prev ? { ...prev, status: 'revoked' } : null);
    } catch (e) {
      // ignore
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 font-sans px-1 sm:px-0">
      {/* Title with 2026@AETERNA branding */}
      <div className="text-center space-y-1">
        <span className="text-[10px] sm:text-[11px] font-bold text-teal-400 uppercase tracking-wider bg-teal-500/10 px-2.5 py-0.5 rounded-full border border-teal-500/20 inline-block">
          Console Donatore (Proprietario File)
        </span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">Invia Documento a Voce</h2>
        <span className="text-xs font-bold text-teal-400 font-mono block">2026@AETERNA</span>
        <p className="text-[11px] sm:text-xs text-slate-400">Inserisci il codice di 4 cifre dettato dalla reception.</p>
      </div>

      {/* STEP 1: INPUT RECEIVER CODE */}
      {!session && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-2">
              Inserisci Codice Ricevente (4 Cifre):
            </label>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                maxLength={4}
                placeholder="Es. 4821"
                value={receiverCodeInput}
                onChange={(e) => setReceiverCodeInput(e.target.value.replace(/\D/g, ''))}
                className="w-full sm:flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-center text-2xl sm:text-3xl font-mono font-bold text-teal-300 tracking-[0.3em] sm:tracking-[0.4em] focus:outline-none focus:border-teal-500"
              />
              <button
                onClick={handleLoadRequest}
                disabled={isLoading || receiverCodeInput.length !== 4}
                className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-teal-500/20 transition disabled:opacity-50 whitespace-nowrap active:scale-95"
              >
                {isLoading ? 'Verifica...' : 'Connetti'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: LOADED REQUEST & ATTACH FILE */}
      {session && session.status === 'pending_donor_upload' && (
        <div className="bg-slate-900 border border-teal-500/40 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5">
          {/* Receiver Message Box */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">
              MESSAGGIO RICEVENTE (Codice: {session.receiverCode})
            </span>
            <p className="text-xs sm:text-sm font-semibold text-slate-100 italic break-words">
              "{session.receiverMessage}"
            </p>
          </div>

          {/* File Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-200">
              Allega il tuo Documento / File:
            </label>

            {/* Custom File Upload Box */}
            <div className="border-2 border-dashed border-slate-700 hover:border-teal-500/60 bg-slate-950 rounded-2xl p-4 sm:p-5 text-center transition space-y-3">
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="max-w-full overflow-hidden">
                    <h4 className="text-xs font-bold text-slate-100 truncate">{selectedFile.name}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">{selectedFile.size}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-[11px] text-red-400 hover:underline"
                  >
                    Rimuovi e cambia file
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-slate-500 mx-auto" />
                  <div>
                    <p className="text-xs text-slate-300 font-medium">Fai un tap per caricare una foto o file</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">JPG, PNG, PDF (Max 15MB)</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="donor-file-input"
                  />
                  <div className="flex flex-col sm:flex-row gap-2 justify-center w-full">
                    <label
                      htmlFor="donor-file-input"
                      className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer text-center transition"
                    >
                      Sfoglia File...
                    </label>
                    <button
                      type="button"
                      onClick={handleUsePresetDocument}
                      className="w-full sm:w-auto px-4 py-2.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-xs font-semibold rounded-xl text-center transition"
                    >
                      Usa Documento Demo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons - Mobile optimized */}
          <div className="space-y-2.5 pt-2">
            <button
              onClick={handleAttachAndAuthorize}
              disabled={isLoading || !selectedFile}
              className="w-full py-3.5 px-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-teal-500/20 transition disabled:opacity-50 text-center uppercase tracking-wide break-words"
            >
              {isLoading ? 'Autorizzazione...' : 'AUTORIZZA E GENERA CODICE DONATORE'}
            </button>

            {/* KILL SWITCH BUTTON */}
            <button
              onClick={handleRevoke}
              className="w-full py-3 px-3 bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/80 rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-1.5 text-center"
            >
              <XCircle className="w-4 h-4 shrink-0" />
              <span>INTERROMPI E ANNULLA COLLEGAMENTO</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 3 & 4: DISPLAY DONOR CODE + KILL SWITCH */}
      {session && (session.status === 'pending_receiver_unlock' || session.status === 'unlocked') && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 text-center">
          {session.status === 'pending_receiver_unlock' && (
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-300 text-[11px] sm:text-xs font-semibold border border-teal-500/20 max-w-full">
                <Clock className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">In attesa che la reception inserisca il codice...</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1.5 font-medium">Ditta a voce questo CODICE DONATORE:</span>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                  <div className="w-full sm:w-auto text-3xl sm:text-5xl font-mono font-black text-emerald-400 bg-slate-950 px-5 sm:px-8 py-3 rounded-2xl sm:rounded-3xl border-2 border-emerald-500/50 tracking-[0.25em] sm:tracking-[0.4em] shadow-inner">
                    {donorCode || session.donorCode}
                  </div>
                  <button
                    onClick={() => copyCode(donorCode || session.donorCode || '')}
                    className="w-full sm:w-auto px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 flex items-center justify-center space-x-2 text-xs font-bold transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Copiato!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copia Codice</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-center items-center space-x-2 text-xs text-slate-400">
                <span>Scadenza Codice:</span>
                <span className="font-mono font-bold text-amber-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  {Math.floor(donorTimer / 60)}:{(donorTimer % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* BIG RED KILL SWITCH */}
              <div className="pt-3 border-t border-slate-800">
                <button
                  onClick={handleRevoke}
                  className="w-full py-3.5 px-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-red-600/30 transition flex items-center justify-center space-x-2 text-center"
                >
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>INTERROMPI E REVOCA COLLEGAMENTO SUBITO</span>
                </button>
              </div>
            </div>
          )}

          {session.status === 'unlocked' && (
            <div className="py-2 sm:py-4 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-100">TRASFERIMENTO COMPLETATO</h3>
              <p className="text-xs text-slate-400">L'impiegato ha sbloccato il file. La finestra di 30 minuti è attiva.</p>

              {/* KILL SWITCH REMAINS ACTIVE UNTIL END */}
              <button
                onClick={handleRevoke}
                className="w-full py-3 px-3 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800 font-bold text-xs rounded-2xl transition flex items-center justify-center space-x-2 text-center"
              >
                <XCircle className="w-4 h-4 shrink-0" />
                <span>CANCELLA ED ELIMINA FILE ORA</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* REVOKED CONFIRMATION */}
      {session && session.status === 'revoked' && (
        <div className="bg-slate-900 border border-red-500/50 rounded-3xl p-5 sm:p-6 shadow-xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-red-300">COLLEGAMENTO REVOCATO</h3>
          <p className="text-xs text-slate-400">Hai interrotto il trasferimento. Il file e la sessione sono stati cancellati dalla memoria.</p>
          <button
            onClick={() => {
              setSession(null);
              setReceiverCodeInput('');
              setSelectedFile(null);
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-2xl"
          >
            Torna all'Inizio
          </button>
        </div>
      )}
    </div>
  );
};
