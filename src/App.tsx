import React, { useState } from 'react';
import { MinimalHeader, MinimalMode } from './components/MinimalHeader';
import { MinimalReceiverView } from './components/MinimalReceiverView';
import { MinimalDonorView } from './components/MinimalDonorView';
import { MinimalDualSim } from './components/MinimalDualSim';
import { ShieldCheck, Lock, Trash2, Key } from 'lucide-react';

export default function App() {
  const [mode, setMode] = useState<MinimalMode>('receiver');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950 max-w-full overflow-x-hidden">
      {/* Header */}
      <MinimalHeader mode={mode} setMode={setMode} />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {mode === 'receiver' && <MinimalReceiverView />}
        {mode === 'donor' && <MinimalDonorView />}
        {mode === 'dual_sim' && <MinimalDualSim />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 text-slate-500 text-xs">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-col items-center sm:items-start space-y-0.5">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-black text-slate-200 text-sm">GecolaShare</span>
            </div>
            {/* Always under name: 2026@AETERNA */}
            <span className="text-[11px] font-extrabold text-emerald-400 font-mono tracking-wider">
              2026@AETERNA
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1 font-semibold text-emerald-300">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Crittografia AES-256 E2EE</span>
            </span>
            <span className="flex items-center gap-1 font-semibold text-teal-300">
              <Trash2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Auto-Distruzione Istantanea</span>
            </span>
            <span className="flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <span>Vault Locale Donatore</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
