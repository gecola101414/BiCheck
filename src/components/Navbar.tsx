import React from 'react';
import { ShieldCheck, Lock, Users, FileText, Activity, Layers, Sparkles } from 'lucide-react';

export type ActiveTab = 'vault' | 'handshake_donor' | 'receiver_portal' | 'dual_simulator' | 'audit_logs';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  documentCount: number;
  activeSessionCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  documentCount,
  activeSessionCount
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('vault')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-lg shadow-teal-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-teal-200 bg-clip-text text-transparent">
                  SafeHandshake
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">
                  GDPR 2FA
                </span>
              </div>
              <p className="text-xs text-slate-400">Archivio Cloud & Condivisione Temporanea Vocale</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'vault'
                  ? 'bg-slate-800 text-teal-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Mio Archivio</span>
              <span className="ml-1 text-xs px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                {documentCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('handshake_donor')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'handshake_donor'
                  ? 'bg-slate-800 text-teal-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Autorizza (Donatore)</span>
            </button>

            <button
              onClick={() => setActiveTab('receiver_portal')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'receiver_portal'
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Portale Ricevente (Hotel/Ente)</span>
            </button>

            <button
              onClick={() => setActiveTab('dual_simulator')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'dual_simulator'
                  ? 'bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-teal-300 border border-teal-500/30 shadow-sm'
                  : 'text-teal-400/90 hover:text-teal-300 hover:bg-slate-800/80'
              }`}
            >
              <Layers className="w-4 h-4 text-teal-400 animate-pulse" />
              <span className="font-semibold">Simulatore Schermo Splittato</span>
              <Sparkles className="w-3 h-3 text-emerald-400" />
            </button>

            <button
              onClick={() => setActiveTab('audit_logs')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'audit_logs'
                  ? 'bg-slate-800 text-teal-400 border border-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Registro Log</span>
            </button>
          </nav>

          {/* Quick Active Status */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 text-xs bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-slate-300 font-mono">2FA Handshake Attivo</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('vault')}
            className={`px-2 py-1 rounded ${activeTab === 'vault' ? 'text-teal-400 font-bold bg-slate-800' : 'text-slate-400'}`}
          >
            Archivio ({documentCount})
          </button>
          <button
            onClick={() => setActiveTab('handshake_donor')}
            className={`px-2 py-1 rounded ${activeTab === 'handshake_donor' ? 'text-teal-400 font-bold bg-slate-800' : 'text-slate-400'}`}
          >
            Donatore
          </button>
          <button
            onClick={() => setActiveTab('receiver_portal')}
            className={`px-2 py-1 rounded ${activeTab === 'receiver_portal' ? 'text-emerald-400 font-bold bg-slate-800' : 'text-slate-400'}`}
          >
            Ricevente
          </button>
          <button
            onClick={() => setActiveTab('dual_simulator')}
            className={`px-2 py-1 rounded ${activeTab === 'dual_simulator' ? 'text-teal-300 font-bold bg-teal-950/50 border border-teal-500/30' : 'text-slate-400'}`}
          >
            Dual Sim ⚡
          </button>
          <button
            onClick={() => setActiveTab('audit_logs')}
            className={`px-2 py-1 rounded ${activeTab === 'audit_logs' ? 'text-teal-400 font-bold bg-slate-800' : 'text-slate-400'}`}
          >
            Log
          </button>
        </div>
      </div>
    </header>
  );
};
