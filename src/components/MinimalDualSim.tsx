import React from 'react';
import { Layers, Monitor, Smartphone, Sparkles } from 'lucide-react';
import { MinimalReceiverView } from './MinimalReceiverView';
import { MinimalDonorView } from './MinimalDonorView';

export const MinimalDualSim: React.FC = () => {
  return (
    <div className="space-y-6 font-sans">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/30 rounded-3xl p-5 text-slate-100 shadow-xl space-y-2">
        <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>Simulatore Interattivo a Schermo Splittato (Dual View ⚡)</span>
        </div>
        <h2 className="text-xl font-black tracking-tight">
          Testa Entrambi gli Schermi in Contemporanea
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
          Prova l'intero flusso a 4 cifre tra la Reception (a sinistra) e lo Smartphone del Cliente (a destra).
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Receiver */}
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
              <Monitor className="w-4 h-4" />
              <span>TERMINALE RICEVENTE (Hotel / Ente)</span>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono font-bold">
              Schermo 1
            </span>
          </div>

          <MinimalReceiverView />
        </div>

        {/* Right: Donor */}
        <div className="bg-slate-900/90 border border-teal-500/30 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-teal-400 font-bold text-xs">
              <Smartphone className="w-4 h-4" />
              <span>SMARTPHONE DONATORE (Cliente)</span>
            </div>
            <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/30 font-mono font-bold">
              Schermo 2
            </span>
          </div>

          <MinimalDonorView />
        </div>
      </div>
    </div>
  );
};
