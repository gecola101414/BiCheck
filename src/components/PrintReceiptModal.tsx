import React from 'react';
import { X, Printer, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { HandshakeSession, DocumentItem } from '../types';

interface PrintReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: HandshakeSession | null;
  document?: DocumentItem | null;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  isOpen,
  onClose,
  session,
  document
}) => {
  if (!isOpen) return null;

  const docTitle = document?.title || session?.documentTitle || "Documento d'Identità";
  const receiverName = session?.receiverName || "Reception Hotel / Ente Verificatore";
  const fields = document?.essentialFields || session?.essentialData || {
    "Cognome": "Rossi",
    "Nome": "Mario",
    "Numero Documento": document?.documentNumber || "CA12345ZZ",
    "Codice Fiscale": "RSSMRA88R15F205Z",
    "Scadenza": document?.expiryDate || "10/05/2032"
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full text-slate-100 shadow-2xl overflow-hidden my-6">
        {/* Modal controls bar - hidden during print */}
        <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-2 text-teal-400 font-bold text-sm">
            <Printer className="w-4 h-4" />
            <span>Anteprima Stampa Ricevuta Minimizzata (GDPR)</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-lg transition shadow-md"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Stampa Ora / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas Area */}
        <div className="p-8 bg-white text-slate-900 print:p-0 print:m-0 print:shadow-none font-sans text-xs">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
            <div>
              <div className="flex items-center space-x-2 text-slate-900 font-black text-base uppercase tracking-tight">
                <ShieldCheck className="w-5 h-5 text-teal-600 inline" />
                <span>RICEVUTA DI ACQUISIZIONE DATI MINIMIZZATI</span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium">
                Conforme al Regolamento UE 2016/679 (GDPR - Art. 5 Principi di Minimizzazione)
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded text-[10px] uppercase">
                NO FOTO / SOLO TESTO
              </span>
            </div>
          </div>

          {/* Transaction Metadata Table */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-6 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Soggetto Verificatore / Ricevente:</span>
              <span className="font-bold text-slate-900">{receiverName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipo Documento Riconosciuto:</span>
              <span className="font-bold text-slate-900">{docTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Data e Ora Acquisizione:</span>
              <span className="font-mono text-slate-800">{new Date().toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Codice Transazione Handshake:</span>
              <span className="font-mono font-bold text-teal-700">{session?.id.toUpperCase() || 'TX_987654'}</span>
            </div>
          </div>

          {/* Essential Data Table */}
          <div className="mb-6">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-300 pb-1 mb-3">
              Dati Essenziali Autenticati
            </h4>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-left">
                  <th className="py-1.5 px-3 font-semibold text-slate-700 w-1/3">Campo</th>
                  <th className="py-1.5 px-3 font-semibold text-slate-700">Valore Autenticato</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(fields).map(([k, v], i) => (
                  <tr key={i} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-600">{k}</td>
                    <td className="py-2 px-3 font-bold text-slate-900 font-mono">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* GDPR Legal Declaration */}
          <div className="border border-teal-200 bg-teal-50/70 p-3 rounded-lg text-[10px] text-teal-900 space-y-1 mb-6">
            <div className="flex items-center space-x-1 font-bold text-teal-950">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Dichiarazione di conformità e riservatezza:</span>
            </div>
            <p className="leading-normal">
              I dati soprastanti sono stati acquisiti con consenso vocale attivo in tempo reale tramite protocollo SafeHandshake. Nessuna scansione d'immagine, fotografia o firma autografa è stata conservata nel sistema del ricevente. La consultazione a tempo è valida per 10 minuti dal momento dello sblocco.
            </p>
          </div>

          {/* Signature lines for hotel/office */}
          <div className="pt-8 border-t border-slate-300 flex justify-between text-[10px] text-slate-600">
            <div>
              <p className="font-medium">Firma Operatore Verificatore</p>
              <div className="h-8 border-b border-slate-400 w-48 mt-1"></div>
            </div>
            <div className="text-right">
              <p className="font-medium">Timbro Struttura / Ente</p>
              <div className="h-8 border-b border-slate-400 w-48 mt-1 ml-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
