import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Search, Filter, Download, FileText, CheckCircle2, XCircle, Clock, Lock } from 'lucide-react';
import { AuditLog } from '../types';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      if (data.success && data.logs) {
        setLogs(data.logs);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.receiverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.documentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.handshakeTx.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  const getActionBadge = (action: AuditLog['action']) => {
    switch (action) {
      case 'HANDSHAKE_COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> Sblocco Riuscito</span>;
      case 'DONOR_AUTHORIZED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20 flex items-center gap-1 w-fit"><Lock className="w-3 h-3" /> Donatore Autorizzato</span>;
      case 'REQUEST_GENERATED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> Codice Generato</span>;
      case 'ACCESS_DENIED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> Accesso Negato</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">Evento</span>;
    }
  };

  const exportCSV = () => {
    const headers = "ID,Timestamp,Ricevente,Documento,Modalita,Azione,TX,IP,Dettagli\n";
    const rows = filteredLogs.map(l => 
      `"${l.id}","${l.timestamp}","${l.receiverName}","${l.documentTitle}","${l.shareMode}","${l.action}","${l.handshakeTx}","${l.ipAddress}","${l.details}"`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_safehandshake_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Registro di Sicurezza Immutabile (Audit Ledger)</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mt-1">
            Tracciabilità Accessi & Handshake
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ogni operazione di autorizzazione lascia una traccia digitale verificabile (Chi, Cosa, Quando, Indirizzo IP, Modalità).
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 rounded-xl text-xs font-bold transition shadow-md"
        >
          <Download className="w-4 h-4" />
          <span>Esporta Log CSV</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cerca per ricevente, doc o TX..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setFilterAction('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterAction === 'all' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            Tutti gli Eventi
          </button>
          <button
            onClick={() => setFilterAction('HANDSHAKE_COMPLETED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterAction === 'HANDSHAKE_COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            Sblocchi Riusciti
          </button>
          <button
            onClick={() => setFilterAction('DONOR_AUTHORIZED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterAction === 'DONOR_AUTHORIZED' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            Autorizzazioni
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Caricamento registro log in corso...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">Nessun log trovato per i filtri selezionati.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Data e Ora</th>
                  <th className="py-3 px-4">Stato Evento</th>
                  <th className="py-3 px-4">Soggetto Ricevente</th>
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Modalità</th>
                  <th className="py-3 px-4">Transazione TX</th>
                  <th className="py-3 px-4">IP Terminale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">{getActionBadge(log.action)}</td>
                    <td className="py-3 px-4 font-bold text-slate-200">{log.receiverName}</td>
                    <td className="py-3 px-4 text-teal-300 font-medium">{log.documentTitle}</td>
                    <td className="py-3 px-4">
                      {log.shareMode === 'essential_text' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                          Solo Testo GDPR
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          PDF Completo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-[11px]">
                      {log.handshakeTx}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
