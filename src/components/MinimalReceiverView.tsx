import React, { useState, useEffect } from 'react';
import { Monitor, Clock, Download, AlertCircle, RefreshCw, Send, FileText, CheckCircle2, MessageSquare, ArrowRight } from 'lucide-react';
import { EphemeralSession } from '../types';
import { requestReceiverCode, receiverUnlock, fetchSessionStatus, subscribeToSession } from '../services/apiService';

export const MinimalReceiverView: React.FC = () => {
  const [customMessage, setCustomMessage] = useState('Ciao! Mi mandi il tuo documento di identità per la registrazione Hotel?');
  const [session, setSession] = useState<EphemeralSession | null>(null);
  const [donorCodeInput, setDonorCodeInput] = useState('');
  
  const [receiverTimer, setReceiverTimer] = useState<number>(900);
  const [unlockedTimer, setUnlockedTimer] = useState<number>(1800);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets = [
    "Ciao! Mi mandi il documento per il check-in Hotel?",
    "Salve! Mi invii la patente per il noleggio auto?",
    "Buongiorno, ho bisogno del codice fiscale per la ricevuta."
  ];

  // Real-time Firestore subscription & polling backup
  useEffect(() => {
    if (!session || session.status === 'unlocked' || session.status === 'revoked' || session.status === 'expired') {
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
    try {
      const newSession = await requestReceiverCode(customMessage);
      setSession(newSession);
      setReceiverTimer(900);
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
      setUnlockedTimer(600); // 10 minutes
    } catch (err: any) {
      setErrorMsg(err.message || 'Codice errato o scaduto.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5 font-sans">
      {/* View Title */}
      <div className="text-center space-y-1">
        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 inline-block">
          Console Ricevente (Hotel / Ente)
        </span>
        <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">Richiedi Documento</h2>
        <p className="text-xs text-slate-400">Genera il codice a 4 cifre e dettalo a voce al cliente.</p>
      </div>

      {/* STEP 1 FORM */}
      {(!session || session.status === 'expired' || session.status === 'revoked') && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
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
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <span>Generazione...</span>
            ) : (
              <>
                <span>Genera Codice Ricevente (4 Cifre)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 & 3: DISPLAY RECEIVER CODE & ENTER DONOR CODE */}
      {session && (session.status === 'pending_donor_upload' || session.status === 'pending_receiver_unlock') && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
          {/* Receiver Code Display */}
          <div className="space-y-2 border-b border-slate-800 pb-5">
            <span className="text-xs text-slate-400 block font-medium">Il tuo Codice Ricevente (Dillo a voce al cliente):</span>
            <div className="inline-block text-5xl font-mono font-black text-emerald-400 bg-slate-950 px-8 py-3.5 rounded-3xl border-2 border-emerald-500/50 shadow-inner tracking-[0.4em]">
              {session.receiverCode}
            </div>
            <div className="flex items-center justify-center space-x-2 text-xs text-amber-400 mt-2">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Scadenza Codice:</span>
              <span className="font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {Math.floor(receiverTimer / 60)}:{(receiverTimer % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Status Message */}
          {session.status === 'pending_donor_upload' && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-center space-x-2 text-xs font-semibold text-amber-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>In attesa che il cliente carichi il file col codice {session.receiverCode}...</span>
              </div>
            </div>
          )}

          {/* Donor Code Entry */}
          {session.status === 'pending_receiver_unlock' && (
            <div className="space-y-4 text-left">
              <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Il cliente ha caricato il file! Chiedigli il <strong>Codice Donatore (4 cifre)</strong>.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">Inserisci Codice Donatore (4 cifre):</label>
                <div className="flex gap-2 sm:gap-3">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Es. 9988"
                    value={donorCodeInput}
                    onChange={(e) => setDonorCodeInput(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-center text-3xl font-mono font-bold text-emerald-300 tracking-[0.4em] focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleUnlock}
                    disabled={isLoading || donorCodeInput.length !== 4}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
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
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => setSession(null)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Annulla Richiesta
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 UNLOCKED FILE DOWNLOAD */}
      {session && session.status === 'unlocked' && (
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              FILE PRONTO PER IL DOWNLOAD
            </span>
            <h3 className="text-xl font-extrabold text-slate-100 mt-2">{session.fileName || 'documento.jpg'}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Dimensione: {session.fileSize || '1.2 MB'}</p>
          </div>

          <div className="inline-flex items-center space-x-2 bg-slate-950 px-4 py-1.5 rounded-full border border-slate-800 text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Link attivo per:</span>
            <span className="font-mono font-bold text-emerald-400">
              {Math.floor(unlockedTimer / 60)}:{(unlockedTimer % 60).toString().padStart(2, '0')}
            </span>
          </div>

          {/* Preview image if available */}
          {session.fileDataUrl && (
            <div className="max-w-xs mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2">
              <img src={session.fileDataUrl} alt="Document Preview" className="w-full max-h-48 object-contain rounded-xl" />
            </div>
          )}

          <div>
            <a
              href={session.fileDataUrl || '#'}
              download={session.fileName || 'documento.jpg'}
              className="inline-flex items-center space-x-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl shadow-emerald-500/20 transition transform active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>SCARICA FILE ORA</span>
            </a>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => setSession(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
            >
              Chiudi Sessione
            </button>
          </div>
        </div>
      )}

      {/* REVOKED STATE */}
      {session && session.status === 'revoked' && (
        <div className="bg-slate-900 border border-red-500/50 rounded-3xl p-6 shadow-xl text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-red-300">COLLEGAMENTO INTERROTTO DAL DONATORE</h3>
          <p className="text-xs text-slate-400">Il proprietario del file ha annullato il trasferimento ed i dati sono stati eliminati.</p>
          <button
            onClick={() => setSession(null)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl"
          >
            Nuova Richiesta
          </button>
        </div>
      )}
    </div>
  );
};
