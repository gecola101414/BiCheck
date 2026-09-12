import React from 'react';
import { Smartphone, Monitor, Layers, Shield, Lock, Zap } from 'lucide-react';

export type MinimalMode = 'receiver' | 'donor' | 'quick_direct' | 'dual_sim';

interface MinimalHeaderProps {
  mode: MinimalMode;
  setMode: (mode: MinimalMode) => void;
}

export const MinimalHeader: React.FC<MinimalHeaderProps> = ({ mode, setMode }) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand */}
        <div 
          onClick={() => setMode('receiver')}
          className="flex items-center space-x-2.5 cursor-pointer select-none group"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0 group-hover:scale-105 transition transform">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center relative overflow-hidden">
              <Shield className="w-5 h-5 text-emerald-400 fill-emerald-500/10" />
              <Lock className="w-2.5 h-2.5 text-cyan-300 absolute" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-300 bg-clip-text text-transparent">
                GecolaShare
              </span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 fill-emerald-300" />
                <span>E2EE</span>
              </span>
            </div>
            {/* Always under name: 2026@AETERNA */}
            <span className="text-[11px] font-extrabold tracking-widest text-emerald-400 font-mono leading-none mt-0.5">
              2026@AETERNA
            </span>
          </div>
        </div>

        {/* Mode Selector */}
        <nav className="w-full sm:w-auto flex items-center justify-center bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setMode('receiver')}
            className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl transition ${
              mode === 'receiver'
                ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">Richiedi</span>
          </button>

          <button
            onClick={() => setMode('donor')}
            className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl transition ${
              mode === 'donor'
                ? 'bg-teal-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">Invia E2EE</span>
          </button>

          <button
            onClick={() => setMode('quick_direct')}
            className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl transition ${
              mode === 'quick_direct'
                ? 'bg-cyan-400 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0 fill-current" />
            <span className="text-xs">Invio Veloce</span>
          </button>

          <button
            onClick={() => setMode('dual_sim')}
            className={`flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl transition ${
              mode === 'dual_sim'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">Dual View</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
