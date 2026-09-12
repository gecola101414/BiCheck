import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Lock, CheckCircle2, AlertCircle, Clock, 
  ArrowRight, Users, Copy, Sparkles, XCircle, FileText, Check 
} from 'lucide-react';
import { DocumentItem, HandshakeSession, ShareMode } from '../types';

interface HandshakeWorkflowProps {
  documents: DocumentItem[];
  preselectedDocument?: DocumentItem | null;
  onSessionUpdate?: () => void;
}

export const HandshakeWorkflow: React.FC<HandshakeWorkflowProps> = ({
  documents,
  preselectedDocument,
  onSessionUpdate
}) => {
  // Input field for 4-digit Receiver Code
  const [receiverCodeInput, setReceiverCodeInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Verified session object returned from step 2
  const [activeSession, setActiveSession] = useState<HandshakeSession | null>(null);
  const [selectedShareMode, setSelectedShareMode] = useState<ShareMode>('essential_text');

  // Step state
  const [generatedDonorCode, setGeneratedDonorCode] = useState<string | null>(null);
  const [donorTimer, setDonorTimer] = useState<number>(120);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Poll status when donor code is generated
  useEffect(() => {
    let interval: any = null;
    if (activeSession && activeSession.status === 'pending_receiver_entry') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/handshake/status/${activeSession.id}`);
          const data = await res.json();
          if (data.success && data.session) {
            setActiveSession(data.session);
            if (data.session.status === 'unlocked') {
              if (onSessionUpdate) onSessionUpdate();
            }
          }
        } catch (e) {
          // ignore
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSession]);

  // Donor code countdown timer
  useEffect(() => {
    let timer: any = null;
    if (generatedDonorCode && donorTimer > 0 && activeSession?.status === 'pending_receiver_entry') {
      timer = setInterval(() => {
        setDonorTimer(prev => prev - 1);
      }, 1000);
    } else if (donorTimer === 0 && activeSession?.status === 'pending_receiver_entry') {
      setErrorMsg('Il Codice Donatore è scaduto. Rigenera o richiedi una nuova sessione.');
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [generatedDonorCode, donorTimer, activeSession]);

  // Verify Receiver Code input
  const handleVerifyReceiverCode = async (codeToVerify?: string) => {
    const code = codeToVerify || receiverCodeInput.trim();
    if (!code || code.length !== 4) {
      setErrorMsg('Inserisci un codice ricevente di 4 cifre valido.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/handshake/verify-receiver-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverCode: code })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Codice non trovato o scaduto.');
      }

      setActiveSession(data.session);
      setSelectedShareMode(data.session.shareMode || 'essential_text');
    } catch (err: any) {
      setErrorMsg(err.message || 'Codice ricevente invalido.');
      setActiveSession(null);
    } finally {
      setIsVerifying(false);
    }
  };

  // Authorize & generate 4-digit Donor Code
  const handleAuthorize = async () => {
    if (!activeSession) return;

    setIsAuthorizing(true);
    setErrorMsg(null);

    try {
      // Find essential fields of document if available
      const doc = documents.find(d => d.id === activeSession.documentId) || preselectedDocument;
      const essentialData = doc?.essentialFields || {
        "Cognome": "Rossi",
        "Nome": "Mario",
        "Codice Fiscale": "RSSMRA88R15F205Z"
      };

      const res = await fetch('/api/handshake/authorize-donor-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession.id,
          shareMode: selectedShareMode,
          essentialData,
          fileUrl: doc?.fileUrl
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore durante l\'autorizzazione');
      }

      setActiveSession(data.session);
      setGeneratedDonorCode(data.donorCode);
      setDonorTimer(120);
      if (onSessionUpdate) onSessionUpdate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore durante la generazione del codice donatore.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleDeny = async () => {
    if (!activeSession) return;
    try {
      await fetch('/api/handshake/deny-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSession.id })
      });
      setActiveSession(prev => prev ? { ...prev, status: 'denied' } : null);
      if (onSessionUpdate) onSessionUpdate();
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-2">
        <div className="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span>Pannello Donatore - Autorizzazione a Voce (2FA Handshake)</span>
        </div>
        <h2 className="text-xl font-bold text-slate-100">
          Stretta di Mano Bilaterale Temporanea
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Inserisci il <span className="text-teal-300 font-medium">Codice Ricevente di 4 cifre</span> che l'operatore (es. reception hotel) ti detta a voce. Verificherai l'identità del richiedente e genererai il <span className="text-emerald-300 font-medium font-semibold">Codice Donatore</span> finale valido per 2 minuti.
        </p>
      </div>

      {/* STEP 1: Insert 4-Digit Receiver Code */}
      {!activeSession && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Inserisci Codice Ricevente (4 cifre)</h3>
              <p className="text-xs text-slate-400">Chiedi all'impiegato/ricevente di dettarti il codice sul suo schermo.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              maxLength={4}
              placeholder="Es. 1122"
              value={receiverCodeInput}
              onChange={(e) => setReceiverCodeInput(e.target.value.replace(/\D/g, ''))}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold text-teal-300 tracking-[0.5em] focus:outline-none focus:border-teal-500 placeholder:tracking-normal placeholder:text-slate-600 placeholder:text-sm"
            />
            <button
              onClick={() => handleVerifyReceiverCode()}
              disabled={isVerifying || receiverCodeInput.length !== 4}
              className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition disabled:opacity-50 whitespace-nowrap flex items-center justify-center space-x-2"
            >
              {isVerifying ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></span>
                  <span>Verifica...</span>
                </>
              ) : (
                <>
                  <span>Verifica Identità Ricevente</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Verify Receiver Identity & Select Share Options */}
      {activeSession && activeSession.status === 'pending_donor_auth' && (
        <div className="bg-slate-900 border border-teal-500/40 rounded-2xl p-6 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 font-bold text-sm">
                2
              </div>
              <div>
                <span className="text-xs text-teal-400 font-bold uppercase tracking-wider">Identità Verificata</span>
                <h3 className="text-base font-bold text-slate-100">{activeSession.receiverName}</h3>
              </div>
            </div>
            <button
              onClick={() => setActiveSession(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Annulla / Cambio Codice
            </button>
          </div>

          {/* Session Details Box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Documento Richiesto:</span>
              <span className="font-bold text-teal-300">{activeSession.documentTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Ruolo / Tipo Richiedente:</span>
              <span className="text-slate-300">{activeSession.receiverRole}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Codice Ricevente Inserito:</span>
              <span className="font-mono font-bold text-slate-200">{activeSession.receiverCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Indirizzo IP Terminale:</span>
              <span className="font-mono text-slate-400">{activeSession.ipAddress}</span>
            </div>
          </div>

          {/* Share Mode Switcher */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
              Scegli il livello di riservatezza da concedere:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setSelectedShareMode('essential_text')}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-start space-x-3 ${
                  selectedShareMode === 'essential_text'
                    ? 'bg-teal-950/40 border-teal-500 text-teal-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  selectedShareMode === 'essential_text' ? 'border-teal-400 bg-teal-400' : 'border-slate-600'
                }`}>
                  {selectedShareMode === 'essential_text' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <span>Solo Dati Essenziali</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300">GDPR Consigliato</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                    L'impiegato vedrà solo i campi testo (Cognome, Nome, N° Doc, Scadenza). <strong className="text-slate-300">Nessuna foto o firma viene inviata.</strong>
                  </p>
                </div>
              </div>

              <div
                onClick={() => setSelectedShareMode('full_document')}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-start space-x-3 ${
                  selectedShareMode === 'full_document'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  selectedShareMode === 'full_document' ? 'border-emerald-400 bg-emerald-400' : 'border-slate-950'
                }`}>
                  {selectedShareMode === 'full_document' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Documento PDF Completo</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                    Concede la visualizzazione ed il download del file originale completo durante la finestra di 10 minuti.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={handleDeny}
              className="px-4 py-2 bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-800/60 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>Rifiuta Richiesta</span>
            </button>

            <button
              onClick={handleAuthorize}
              disabled={isAuthorizing}
              className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center space-x-2"
            >
              {isAuthorizing ? (
                <span>Generazione Codice...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Autorizza e Genera Codice Donatore</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 & 4: Display Generated Donor Code + Live Unlock Status */}
      {activeSession && (activeSession.status === 'pending_receiver_entry' || activeSession.status === 'unlocked' || activeSession.status === 'denied') && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          {activeSession.status === 'pending_receiver_entry' && (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-300 text-xs font-semibold border border-teal-500/20">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>In attesa dell'inserimento da parte del Ricevente...</span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1">Ditta a voce all'impiegato questo Codice Donatore:</span>
                <div className="flex items-center justify-center space-x-3">
                  <div className="text-4xl font-mono font-extrabold text-emerald-400 bg-slate-950 px-6 py-3 rounded-2xl border-2 border-emerald-500/50 shadow-inner tracking-[0.4em]">
                    {generatedDonorCode || activeSession.donorCode}
                  </div>
                  <button
                    onClick={() => copyCode(generatedDonorCode || activeSession.donorCode || '')}
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700"
                    title="Copia codice"
                  >
                    {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Timer ring */}
              <div className="flex justify-center items-center space-x-2 text-xs text-slate-400">
                <span>Scadenza Codice Donatore:</span>
                <span className="font-mono font-bold text-amber-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  {Math.floor(donorTimer / 60)}:{(donorTimer % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 text-left max-w-md mx-auto space-y-1">
                <p><strong>Destinatario:</strong> {activeSession.receiverName}</p>
                <p><strong>Modalità autorizzata:</strong> {activeSession.shareMode === 'essential_text' ? 'Solo Dati Essenziali (GDPR Minimal)' : 'Documento Completo'}</p>
              </div>
            </div>
          )}

          {activeSession.status === 'unlocked' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">STRETTA DI MANO COMPLETATA!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  L'operatore di <span className="text-teal-300 font-semibold">{activeSession.receiverName}</span> ha sbloccato la consultazione a tempo.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 max-w-md mx-auto text-xs space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-500">Stato Sessione:</span>
                  <span className="font-bold text-emerald-400">Attiva (10 minuti di consultazione)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Modalità:</span>
                  <span className="text-slate-200">{activeSession.shareMode === 'essential_text' ? 'Testo Essenziale (No Foto)' : 'File PDF'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Log di sicurezza:</span>
                  <span className="font-mono text-slate-400">TX_{activeSession.id.toUpperCase()} (Registrato)</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveSession(null);
                  setReceiverCodeInput('');
                  setGeneratedDonorCode(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
              >
                Completa e Torna al Pannello
              </button>
            </div>
          )}

          {activeSession.status === 'denied' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500 text-red-400 flex items-center justify-center mx-auto">
                <XCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-red-300">Richiesta Rifiutata</h3>
              <p className="text-xs text-slate-400">Hai negato l'accesso a questo documento.</p>
              <button
                onClick={() => setActiveSession(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl"
              >
                Chiudi
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
