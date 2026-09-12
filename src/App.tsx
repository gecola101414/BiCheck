import React, { useState } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { VaultManager } from './components/VaultManager';
import { HandshakeWorkflow } from './components/HandshakeWorkflow';
import { ReceiverPortal } from './components/ReceiverPortal';
import { DualSimulator } from './components/DualSimulator';
import { AuditLogView } from './components/AuditLogView';
import { AddDocumentModal } from './components/AddDocumentModal';
import { DocumentItem } from './types';
import { INITIAL_DOCUMENTS } from './data/mockData';
import { ShieldCheck, Lock, Sparkles, Key, FileCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const [documents, setDocuments] = useState<DocumentItem[]>(INITIAL_DOCUMENTS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDocForHandshake, setSelectedDocForHandshake] = useState<DocumentItem | null>(null);

  const handleSaveDocument = (newDoc: DocumentItem) => {
    setDocuments([newDoc, ...documents]);
  };

  const handleDeleteDocument = (docId: string) => {
    setDocuments(documents.filter(d => d.id !== docId));
  };

  const handleStartHandshake = (doc: DocumentItem) => {
    setSelectedDocForHandshake(doc);
    setActiveTab('handshake_donor');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-950">
      {/* Global Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        documentCount={documents.length}
        activeSessionCount={1}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === 'vault' && (
          <VaultManager
            documents={documents}
            onAddDocumentClick={() => setIsAddModalOpen(true)}
            onDeleteDocument={handleDeleteDocument}
            onStartHandshake={handleStartHandshake}
          />
        )}

        {activeTab === 'handshake_donor' && (
          <HandshakeWorkflow
            documents={documents}
            preselectedDocument={selectedDocForHandshake}
          />
        )}

        {activeTab === 'receiver_portal' && (
          <ReceiverPortal
            documents={documents}
          />
        )}

        {activeTab === 'dual_simulator' && (
          <DualSimulator
            documents={documents}
            onSessionUpdate={() => {}}
          />
        )}

        {activeTab === 'audit_logs' && (
          <AuditLogView />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span className="font-semibold text-slate-300">SafeHandshake Vault Protocol</span>
            <span>— Condivisione Temporanea Vocale 2FA & Minimizzazione GDPR</span>
          </div>

          <div className="flex items-center space-x-4 text-slate-400">
            <span className="flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-teal-400" />
              <span>Codici a 4 Cifre (2 Min)</span>
            </span>
            <span className="flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Consultazione (10 Min)</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Add Document Modal */}
      <AddDocumentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveDocument}
      />
    </div>
  );
}
