import React from 'react';
import { Shield, Smartphone, Monitor, Layers, Zap } from 'lucide-react';

export type MinimalMode = 'receiver' | 'donor' | 'dual_sim';

interface MinimalHeaderProps {
  mode: MinimalMode;
  setMode: (mode: MinimalMode) => void;
}

export const MinimalHeader: React.FC<MinimalHeaderProps> = ({ mode, setMode }) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <div 
          onClick={() => setMode('receiver')}
          className="flex items-center space-x-2.5 cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-200 bg-clip-text text-transparent">
                SafeHandshake
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Fast
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Zero Registrazione • Scambio a 4 Cifre</p>
          </div>
        </div>

        {/* Mode Selector */}
        <nav className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setMode('receiver')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
              mode === 'receiver'
                ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Richiedi</span>
            <span className="sm:hidden">Ricevente</span>
          </button>

          <button
            onClick={() => setMode('donor')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
              mode === 'donor'
                ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Invia File</span>
            <span className="sm:hidden">Donatore</span>
          </button>

          <button
            onClick={() => setMode('dual_sim')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
              mode === 'dual_sim'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dual View ⚡</span>
            <span className="sm:hidden">Dual</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
