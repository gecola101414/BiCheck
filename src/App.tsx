import React, { useState } from 'react';
import { MinimalHeader, MinimalMode } from './components/MinimalHeader';
import { MinimalReceiverView } from './components/MinimalReceiverView';
import { MinimalDonorView } from './components/MinimalDonorView';
import { MinimalDualSim } from './components/MinimalDualSim';
import { ShieldCheck, Lock, Clock, Key } from 'lucide-react';

export default function App() {
  const [mode, setMode] = useState<MinimalMode>('receiver');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header */}
      <MinimalHeader mode={mode} setMode={setMode} />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8">
        {mode === 'receiver' && <MinimalReceiverView />}
        {mode === 'donor' && <MinimalDonorView />}
        {mode === 'dual_sim' && <MinimalDualSim />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 text-slate-500 text-xs">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-slate-300">SafeHandshake Ephemeral Protocol</span>
            <span>— Zero Registrazioni • Memory-Only Transfer</span>
          </div>

          <div className="flex items-center justify-center space-x-4 text-slate-400">
            <span className="flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span>4 Cifre (2 Min)</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>Download 10 Min</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
