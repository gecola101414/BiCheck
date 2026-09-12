import React from 'react';
import { Layers, Sparkles, Smartphone, Monitor } from 'lucide-react';
import { DocumentItem } from '../types';
import { HandshakeWorkflow } from './HandshakeWorkflow';
import { ReceiverPortal } from './ReceiverPortal';

interface DualSimulatorProps {
  documents: DocumentItem[];
  onSessionUpdate: () => void;
}

export const DualSimulator: React.FC<DualSimulatorProps> = ({
  documents,
  onSessionUpdate
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-teal-950/60 via-slate-900 to-emerald-950/60 border border-teal-500/30 rounded-2xl p-5 text-slate-100 shadow-xl space-y-2">
        <div className="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>Modalità Simulazione Interattiva Schermo Splittato (Dual View)</span>
        </div>
        <h2 className="text-xl font-bold">
          Testa la Stretta di Mano Bilaterale a Voce
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Simula in un'unica schermata la comunicazione reale tra l'impiegato dell'Hotel (a sinistra) ed il Donatore del file sul suo smartphone (a destra).
        </p>
      </div>

      {/* Split Screen Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Side: Receiver Screen (Hotel Receptionist) */}
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
              <Monitor className="w-4 h-4" />
              <span>TERMINALE RICEVENTE (Hotel / Ente)</span>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
              Schermo 1
            </span>
          </div>

          <ReceiverPortal
            documents={documents}
            onSessionUpdate={onSessionUpdate}
          />
        </div>

        {/* Right Side: Donor Screen (Mario Rossi Smartphone) */}
        <div className="bg-slate-900/90 border border-teal-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-teal-400 font-bold text-xs">
              <Smartphone className="w-4 h-4" />
              <span>SMARTPHONE DONATORE (Proprietario File)</span>
            </div>
            <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30">
              Schermo 2
            </span>
          </div>

          <HandshakeWorkflow
            documents={documents}
            onSessionUpdate={onSessionUpdate}
          />
        </div>
      </div>
    </div>
  );
};
