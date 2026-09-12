import React, { useState } from 'react';
import { 
  FileText, ShieldCheck, Plus, Search, Filter, Calendar, Eye, 
  Lock, Share2, AlertTriangle, CheckCircle, Trash2, Edit3, Sparkles
} from 'lucide-react';
import { DocumentItem, DocumentCategory, ShareMode } from '../types';

interface VaultManagerProps {
  documents: DocumentItem[];
  onAddDocumentClick: () => void;
  onDeleteDocument: (docId: string) => void;
  onStartHandshake: (doc: DocumentItem) => void;
}

export const VaultManager: React.FC<VaultManagerProps> = ({
  documents,
  onAddDocumentClick,
  onDeleteDocument,
  onStartHandshake
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);

  const categories: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'Tutti i Documenti' },
    { id: 'identity', label: 'Carte d\'Identità' },
    { id: 'license', label: 'Patenti' },
    { id: 'passport', label: 'Passaporti' },
    { id: 'health', label: 'Sanità & C.F.' },
    { id: 'utility', label: 'Utenze & Residenza' },
    { id: 'contract', label: 'Contratti' }
  ];

  const filteredDocs = documents.filter(doc => {
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesSearch = 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.documentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadge = (cat: DocumentCategory) => {
    switch (cat) {
      case 'identity': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Carta d'Identità</span>;
      case 'license': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Patente Guida</span>;
      case 'passport': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Passaporto</span>;
      case 'health': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Sanità / CF</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">Documento</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Intro */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center space-x-2 text-teal-400 font-semibold text-xs tracking-wider uppercase">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Cassaforte Cloud Personale & Condivisione Vocale</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            I Miei Documenti Protetti
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ogni file nel tuo archivio è protetto da cifratura. Quando sei in reception o ad uno sportello, puoi concedere l'accesso in 4 passi vocali usando un codice temporaneo di 2 minuti, trasmettendo <span className="text-teal-300 font-medium">solo i dati essenziali di testo (GDPR compliant)</span> senza mai cedere la foto.
          </p>
        </div>

        <button
          onClick={onAddDocumentClick}
          className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-teal-500/20 transition whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Aggiungi Documento</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cerca per titolo, numero o nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document Grid */}
      {filteredDocs.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800 p-8 space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm font-medium">Nessun documento trovato per i filtri attuali.</p>
          <button
            onClick={onAddDocumentClick}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Aggiungi il primo documento</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map(doc => (
            <div
              key={doc.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4 group transition"
            >
              <div className="space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div>
                    {getCategoryBadge(doc.category)}
                    <h3 className="text-base font-bold text-slate-100 group-hover:text-teal-300 transition mt-1">
                      {doc.title}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      N° {doc.documentNumber}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>

                {/* Info Fields */}
                <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Intestatario:</span>
                    <span className="font-semibold text-slate-200">{doc.ownerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scadenza:</span>
                    <span className="font-mono text-emerald-400 font-semibold">{doc.expiryDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Campi Essenziali:</span>
                    <span className="text-slate-400">{Object.keys(doc.essentialFields).length} dati estratti</span>
                  </div>
                </div>

                {/* Notes preview if any */}
                {doc.notes && (
                  <p className="text-[11px] text-slate-400 italic line-clamp-1">
                    "{doc.notes}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedDoc(doc)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Dettagli Dati</span>
                </button>

                <button
                  onClick={() => onStartHandshake(doc)}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg text-xs font-bold transition shadow-sm"
                >
                  <Share2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>Condividi a Voce</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full text-slate-100 shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs text-teal-400 font-bold uppercase tracking-wider">Scheda Archivio</span>
                <h3 className="text-lg font-bold text-slate-100">{selectedDoc.title}</h3>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">Numero Documento</span>
                  <span className="font-mono font-bold text-slate-200">{selectedDoc.documentNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Intestatario</span>
                  <span className="font-semibold text-slate-200">{selectedDoc.ownerName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Rilascio</span>
                  <span className="text-slate-300">{selectedDoc.issueDate} ({selectedDoc.issuingAuthority})</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Scadenza</span>
                  <span className="text-emerald-400 font-semibold">{selectedDoc.expiryDate}</span>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-teal-300 uppercase tracking-wider text-[11px] mb-2">
                  Dati Essenziali Estratti (Minimizzazione GDPR)
                </h4>
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                  {Object.entries(selectedDoc.essentialFields).map(([k, v], idx) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-slate-800/60 last:border-none">
                      <span className="text-slate-400 font-medium">{k}:</span>
                      <span className="font-mono text-slate-200 font-semibold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  onDeleteDocument(selectedDoc.id);
                  setSelectedDoc(null);
                }}
                className="text-red-400 hover:text-red-300 text-xs flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Elimina</span>
              </button>

              <div className="flex space-x-2">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg"
                >
                  Chiudi
                </button>
                <button
                  onClick={() => {
                    const doc = selectedDoc;
                    setSelectedDoc(null);
                    onStartHandshake(doc);
                  }}
                  className="px-4 py-1.5 bg-teal-500 text-slate-950 font-bold text-xs rounded-lg shadow-md"
                >
                  Avvia Handshake
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
