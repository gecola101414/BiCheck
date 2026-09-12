import React, { useState, useEffect } from 'react';
import { 
  Users, Building, FileText, CheckCircle2, Clock, Copy, Printer, 
  Download, Lock, ArrowRight, ShieldCheck, Check, AlertCircle, RefreshCw 
} from 'lucide-react';
import { DocumentItem, HandshakeSession, ReceiverAccount } from '../types';
import { REGISTERED_RECEIVERS } from '../data/mockData';
import { PrintReceiptModal } from './PrintReceiptModal';

interface ReceiverPortalProps {
  documents: DocumentItem[];
  onSessionUpdate?: () => void;
}

export const ReceiverPortal: React.FC<ReceiverPortalProps> = ({
  documents,
  onSessionUpdate
}) => {
  const [selectedReceiver, setSelectedReceiver] = useState<ReceiverAccount>(REGISTERED_RECEIVERS[0]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(documents[0]?.id || 'doc-1');
  
  // Handshake State
  const [currentSession, setCurrentSession] = useState<HandshakeSession | null>(null);
  const [donorCodeInput, setDonorCodeInput] = useState('');
  const [receiverTimer, setReceiverTimer] = useState<number>(120);
  const [unlockedTimer, setUnlockedTimer] = useState<number>(600);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Poll for status when waiting for Donor authorization (between Step 1 and 3)
  useEffect(() => {
    let interval: any = null;
    if (currentSession && currentSession.status === 'pending_donor_auth') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/handshake/status/${currentSession.id}`);
          const data = await res.json();
          if (data.success && data.session) {
            setCurrentSession(data.session);
          }
        } catch (e) {
          // ignore
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentSession]);

  // Timers countdown
  useEffect(() => {
    let timer: any = null;
    if (currentSession && (currentSession.status === 'pending_donor_auth' || currentSession.status === 'pending_receiver_entry')) {
      timer = setInterval(() => {
        setReceiverTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (currentSession && currentSession.status === 'unlocked' && unlockedTimer > 0) {
      timer = setInterval(() => {
        setUnlockedTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentSession, unlockedTimer]);

  // Step 1: Create Receiver Code
  const handleCreateReceiverCode = async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    const doc = documents.find(d => d.id === selectedDocumentId) || documents[0];

    try {
      const res = await fetch('/api/handshake/create-receiver-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverName: selectedReceiver.name,
          receiverRole: selectedReceiver.category,
          documentId: doc.id,
          documentTitle: doc.title,
          shareMode: doc.defaultShareMode
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore durante la creazione del codice');
      }

      setCurrentSession(data.session);
      setReceiverTimer(120);
      setDonorCodeInput('');
      if (onSessionUpdate) onSessionUpdate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore di connessione');
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 4: Unlock session with Donor Code
  const handleUnlockSession = async () => {
    if (!currentSession || donorCodeInput.length !== 4) {
      setErrorMsg('Inserisci il codice Donatore di 4 cifre.');
      return;
    }

    setIsUnlocking(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/handshake/unlock-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession.id,
          donorCode: donorCodeInput.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Codice Donatore errato o non ancora generato.');
      }

      setCurrentSession(data.session);
      setUnlockedTimer(600); // 10 minutes
      if (onSessionUpdate) onSessionUpdate();
    } catch (err: any) {
      setErrorMsg(err.message || 'Codice errato.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyAllFields = () => {
    const doc = documents.find(d => d.id === currentSession?.documentId) || documents[0];
    const text = Object.entries(doc.essentialFields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedField('all');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const selectedDoc = documents.find(d => d.id === (currentSession?.documentId || selectedDocumentId)) || documents[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Receiver Portal Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <Building className="w-4 h-4" />
              <span>Portale Ricevente (Reception / Hotel / Ente)</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 mt-1">
              Acquisizione Documenti in Sicurezza
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Acquisisci i soli dati essenziali a norma GDPR senza richiedere fotocopie cartacee o immagini.
            </p>
          </div>

          {/* Receiver Account Selector */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 shrink-0">
            <label className="text-[10px] text-slate-400 block mb-1">Seleziona Operatore:</label>
            <select
              value={selectedReceiver.id}
              onChange={(e) => {
                const r = REGISTERED_RECEIVERS.find(item => item.id === e.target.value);
                if (r) setSelectedReceiver(r);
              }}
              className="bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-emerald-300 p-1.5 focus:outline-none"
            >
              {REGISTERED_RECEIVERS.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.category})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Container */}
      {!currentSession || currentSession.status === 'expired' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Inizia Richiesta Documento</h3>
              <p className="text-xs text-slate-400">Seleziona il tipo di documento da richiedere al cliente/donatore.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Documento Richiesto:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocumentId(doc.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      selectedDocumentId === doc.id
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-100">{doc.title}</span>
                      <FileText className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Intestatario: {doc.ownerName}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateReceiverCode}
              disabled={isGenerating}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-2"
            >
              {isGenerating ? (
                <span>Generazione Codice Ricevente...</span>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  <span>Genera Codice Ricevente (4 Cifre)</span>
                </>
              )}
            </button>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Active Session (Waiting for Donor Code OR Unlocked) */}
      {currentSession && currentSession.status !== 'expired' && (
        <div className="space-y-6">
          {/* Waiting for Donor Code */}
          {(currentSession.status === 'pending_donor_auth' || currentSession.status === 'pending_receiver_entry') && (
            <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 space-y-6 shadow-2xl">
              {/* Step 1 Code display */}
              <div className="text-center space-y-3 border-b border-slate-800 pb-5">
                <span className="text-xs text-slate-400 block font-medium">Il tuo Codice Ricevente attuale (dillo a voce al cliente):</span>
                <div className="inline-block text-4xl font-mono font-extrabold text-emerald-400 bg-slate-950 px-8 py-3 rounded-2xl border-2 border-emerald-500/50 tracking-[0.4em] shadow-inner">
                  {currentSession.receiverCode}
                </div>
                <div className="flex items-center justify-center space-x-2 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Scadenza Codice:</span>
                  <span className="font-mono font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {Math.floor(receiverTimer / 60)}:{(receiverTimer % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              {currentSession.status === 'pending_donor_auth' && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <div className="flex items-center justify-center space-x-2 text-xs font-semibold text-amber-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>In attesa che il donatore inserisca il codice {currentSession.receiverCode} sul suo schermo...</span>
                  </div>
                </div>
              )}

              {/* Step 3: Enter Donor Code */}
              {currentSession.status === 'pending_receiver_entry' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Il Donatore ha autorizzato la richiesta! Chiedigli il <strong>Codice Donatore (4 cifre)</strong>.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">Inserisci Codice Donatore (4 cifre):</label>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="Es. 9988"
                        value={donorCodeInput}
                        onChange={(e) => setDonorCodeInput(e.target.value.replace(/\D/g, ''))}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold text-emerald-300 tracking-[0.4em] focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={handleUnlockSession}
                        disabled={isUnlocking || donorCodeInput.length !== 4}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {isUnlocking ? 'Sblocco...' : 'Sblocca Documento'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setCurrentSession(null)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Annulla Sessione
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 UNLOCKED DATA VIEW */}
          {currentSession.status === 'unlocked' && (
            <div className="bg-slate-900 border border-emerald-500 rounded-2xl p-6 space-y-6 shadow-2xl">
              {/* Unlocked Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">ACCESSO SBLOCCATO</span>
                    <h3 className="text-lg font-extrabold text-slate-100">{currentSession.documentTitle}</h3>
                  </div>
                </div>

                <div className="flex items-center space-x-3 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-800">
                  <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <div className="text-xs">
                    <span className="text-slate-500 block text-[10px]">Timer Sessione:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {Math.floor(unlockedTimer / 60)}:{(unlockedTimer % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Share Mode Render */}
              {currentSession.shareMode === 'essential_text' ? (
                /* GDPR Minimalist Text View */
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                        Visualizzazione Minimizzata GDPR (No Foto)
                      </span>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={copyAllFields}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center space-x-1.5 border border-slate-700 transition"
                      >
                        {copiedField === 'all' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copiati!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copia Tutti i Dati</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setIsPrintModalOpen(true)}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-md transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Stampa Ricevuta</span>
                      </button>
                    </div>
                  </div>

                  {/* Essential Text Grid */}
                  <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(selectedDoc.essentialFields).map(([k, v], i) => (
                      <div key={i} className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-slate-400 font-medium block">{k}</span>
                          <span className="text-sm font-bold text-slate-100 font-mono mt-0.5">{v}</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(String(v), k)}
                          className="text-slate-500 hover:text-emerald-400 p-1.5 rounded hover:bg-slate-800 transition font-sans"
                          title="Copia valore"
                        >
                          {copiedField === k ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Full PDF / File View */
                <div className="space-y-4 text-center py-6 bg-slate-950 rounded-xl border border-slate-800">
                  <FileText className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-200">{selectedDoc.fileName || 'documento_completo.pdf'}</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Il donatore ha concesso l'accesso al file completo ({selectedDoc.fileSize || '1.5 MB'}).
                  </p>
                  <button
                    onClick={() => alert(`Download simulato del file: ${selectedDoc.fileName}`)}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 inline-flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Scarica Documento PDF Originale</span>
                  </button>
                </div>
              )}

              {/* Close session button */}
              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  onClick={() => setCurrentSession(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Chiudi Sessione Consultazione
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Print Receipt Modal */}
      <PrintReceiptModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        session={currentSession}
        document={selectedDoc}
      />
    </div>
  );
};
