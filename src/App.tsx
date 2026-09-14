/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import localforage from 'localforage';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  serverTimestamp,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { 
  Shield, 
  Upload, 
  Download, 
  Plus, 
  CheckCircle2, 
  FileText, 
  Trash2,
  AlertCircle,
  RefreshCw,
  Copy
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import firebaseConfig from '../firebase-applet-config.json';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return JSON.stringify(errInfo);
}

// Types
interface IDDocument {
  id: string;
  label: string;
  fileName: string;
  fileType: string;
  base64: string;
}

export default function App() {
  const [view, setView] = useState<'home' | 'transmitter' | 'creator' | 'downloading'>('home');
  const [code, setCode] = useState('');
  const [myArchive, setMyArchive] = useState<IDDocument[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form refs for creator
  const fileInputRefs = {
    ci: useRef<HTMLInputElement>(null),
    patente: useRef<HTMLInputElement>(null),
    cf: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    loadArchive();
    signInAnonymously(auth).catch(err => console.error('Auth error:', err));
  }, []);

  const loadArchive = async () => {
    try {
      const data = await localforage.getItem<IDDocument[]>('my_id_archive');
      if (data) {
        setMyArchive(data);
      }
    } catch (err) {
      console.error('Failed to load archive:', err);
    }
  };

  const compressImage = (base64Str: string, maxWidth = 1200, maxHeight = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result as string;
        if (file.type.startsWith('image/')) {
          const compressed = await compressImage(base64);
          resolve(compressed);
        } else {
          resolve(base64);
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSaveArchive = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const newDocs: IDDocument[] = [];
      
      const processFile = async (ref: React.RefObject<HTMLInputElement>, label: string) => {
        const file = ref.current?.files?.[0];
        if (file) {
          const base64 = await fileToBase64(file);
          newDocs.push({
            id: crypto.randomUUID(),
            label,
            fileName: file.name,
            fileType: file.type,
            base64
          });
        }
      };

      await processFile(fileInputRefs.ci, 'Carta d\'Identità');
      await processFile(fileInputRefs.patente, 'Patente di Guida');
      await processFile(fileInputRefs.cf, 'Codice Fiscale');

      if (newDocs.length === 0) {
        setError('Carica almeno un documento.');
        setIsProcessing(false);
        return;
      }

      const updatedArchive = [...myArchive, ...newDocs];
      await localforage.setItem('my_id_archive', updatedArchive);
      setMyArchive(updatedArchive);
      setView('transmitter');
    } catch (err) {
      setError('Errore durante il salvataggio.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteFromArchive = async (id: string) => {
    const updated = myArchive.filter(d => d.id !== id);
    await localforage.setItem('my_id_archive', updated);
    setMyArchive(updated);
    if (updated.length === 0) setView('home');
  };

  const handleGenerateCode = async () => {
    if (selectedDocs.size === 0) {
      setError('Seleziona almeno un documento.');
      return;
    }
    setIsProcessing(true);
    setError(null);
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const path = `stanze_condivisione/${roomCode}`;
    
    try {
      // Step 1: Create the room with 'waiting' status
      await setDoc(doc(db, 'stanze_condivisione', roomCode), {
        status: 'waiting',
        createdAt: serverTimestamp()
      });
      
      setGeneratedCode(roomCode);
      setIsProcessing(false);

      // Step 2: Listen for receiver to join
      const unsub = onSnapshot(doc(db, 'stanze_condivisione', roomCode), async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        if (data.status === 'joined') {
          // Receiver joined! Now upload the documents
          setError('Destinatario connesso. Inviando documenti...');
          const docsToShare = myArchive.filter(d => selectedDocs.has(d.id));
          
          try {
            await updateDoc(doc(db, 'stanze_condivisione', roomCode), {
              documents: docsToShare.map(d => ({
                nome: d.fileName,
                tipo: d.fileType,
                base64: d.base64
              })),
              status: 'ready'
            });
            setError('Documenti inviati con successo!');
            unsub(); // Stop listening after success
          } catch (err) {
            setError(`Errore durante l'invio: ${err}`);
          }
        }
      });

    } catch (err: any) {
      setError(`Errore P2P: ${err.message || 'Generazione fallita'}`);
      setIsProcessing(false);
    }
  };

  const handleReceive = async () => {
    if (code.length !== 6) {
      setError('Inserisci un codice a 6 cifre.');
      return;
    }
    setIsProcessing(true);
    setError(null);
    const path = `stanze_condivisione/${code}`;
    
    try {
      const docRef = doc(db, 'stanze_condivisione', code);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // Step 1: Notify transmitter that we joined
        await updateDoc(docRef, {
          status: 'joined'
        });
        
        setError('Connesso. In attesa dei file...');

        // Step 2: Wait for transmitter to upload files
        const unsub = onSnapshot(docRef, async (snapshot) => {
          if (!snapshot.exists()) {
            unsub();
            return;
          }
          const data = snapshot.data();
          if (data.status === 'ready' && data.documents) {
            const documents = data.documents;
            documents.forEach((file: any) => {
              const link = document.createElement('a');
              link.href = file.base64;
              link.download = file.nome;
              link.click();
            });

            await deleteDoc(docRef);
            unsub();
            setCode('');
            setError('Ricezione completata!');
            setIsProcessing(false);
          }
        });
      } else {
        setError('Codice errato o scaduto.');
        setIsProcessing(false);
      }
    } catch (err) {
      setError(`Errore Ricezione: ${handleFirestoreError(err, OperationType.GET, path)}`);
      setIsProcessing(false);
    }
  };

  const toggleDocSelection = (id: string) => {
    const next = new Set(selectedDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDocs(next);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-blue-500/30">
      <div className="max-w-md mx-auto p-6 pt-12">
        {/* Header */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20 shadow-[0_0_20px_rgba(37,99,235,0.1)]">
            <Shield className="w-8 h-8 text-blue-500" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">ID-Share Vault</h1>
          <p className="text-neutral-500 text-sm leading-relaxed px-4">
            Condividi documenti d'identità in modo sicuro e temporaneo.
          </p>
        </div>

        {/* Main Content Card */}
        <div className="bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 shadow-2xl overflow-hidden relative">
          {/* View: Home */}
          {view === 'home' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 ml-1">Ricevi Documenti</label>
                <div className="relative">
                  <input 
                    type="text" 
                    maxLength={6}
                    placeholder="Codice a 6 cifre"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 rounded-2xl p-4 text-center text-2xl tracking-[0.25em] font-mono outline-none transition-all placeholder:text-neutral-700 placeholder:tracking-normal"
                  />
                </div>
                <button 
                  onClick={handleReceive}
                  disabled={isProcessing || code.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 py-4 rounded-2xl font-bold text-white transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  Scarica Documenti
                </button>
              </div>

              <div className="pt-4 border-t border-neutral-800/50">
                <button 
                  onClick={() => setView(myArchive.length > 0 ? 'transmitter' : 'creator')}
                  className="w-full py-4 rounded-2xl font-semibold text-neutral-300 hover:bg-neutral-800/50 border border-neutral-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5 opacity-60" />
                  {myArchive.length > 0 ? 'Gestisci Archivio' : 'Crea Nuovo Archivio'}
                </button>
              </div>
            </div>
          )}

          {/* View: Transmitter */}
          {view === 'transmitter' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Archivio Locale
                </h2>
                <button 
                  onClick={() => setView('creator')}
                  className="p-2 hover:bg-neutral-800 rounded-full transition-colors"
                  title="Aggiungi Documenti"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {myArchive.map((doc) => (
                  <div 
                    key={doc.id}
                    onClick={() => toggleDocSelection(doc.id)}
                    className={cn(
                      "group relative flex items-center p-4 rounded-2xl border transition-all cursor-pointer",
                      selectedDocs.has(doc.id) 
                        ? "bg-emerald-500/5 border-emerald-500/20" 
                        : "bg-neutral-950/50 border-neutral-800 hover:border-neutral-700"
                    )}
                  >
                    <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center mr-4 border border-neutral-800">
                      <FileText className={cn("w-5 h-5", selectedDocs.has(doc.id) ? "text-emerald-500" : "text-neutral-500")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-neutral-200 truncate">{doc.label}</p>
                      <p className="text-xs text-neutral-600 truncate">{doc.fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFromArchive(doc.id);
                        }}
                        className="p-2 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                        selectedDocs.has(doc.id) 
                          ? "bg-emerald-500 border-emerald-500 text-neutral-950" 
                          : "border-neutral-800"
                      )}>
                        {selectedDocs.has(doc.id) && <CheckCircle2 className="w-3 h-3" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!generatedCode ? (
                <button 
                  onClick={handleGenerateCode}
                  disabled={isProcessing || selectedDocs.size === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 py-4 rounded-2xl font-bold text-white transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                  Genera Codice
                </button>
              ) : (
                <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-3xl text-center space-y-4 animate-in zoom-in-95 duration-500">
                  <p className="text-xs font-bold text-emerald-500/80 uppercase tracking-widest">Codice Temporaneo</p>
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-5xl font-black tracking-[0.2em] font-mono text-emerald-400">{generatedCode}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCode);
                        setError('Codice copiato!');
                      }}
                      className="p-2 hover:bg-emerald-500/10 rounded-xl transition-colors text-emerald-500"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 leading-tight">
                    Fornisci questo codice al destinatario.<br/>I file verranno eliminati dopo il download.
                  </p>
                  <button 
                    onClick={() => {
                      setGeneratedCode(null);
                      setSelectedDocs(new Set());
                    }}
                    className="text-xs font-semibold text-emerald-500 underline underline-offset-4 decoration-emerald-500/30 hover:decoration-emerald-500 transition-all"
                  >
                    Genera nuovo codice
                  </button>
                </div>
              )}

              <button 
                onClick={() => setView('home')}
                className="w-full py-3 text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Torna alla Home
              </button>
            </div>
          )}

          {/* View: Creator */}
          {view === 'creator' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-2">
                <h2 className="text-lg font-bold text-white">Configura Archivio</h2>
                <p className="text-xs text-neutral-500">I file verranno salvati solo nella memoria del tuo browser.</p>
              </div>

              <div className="space-y-4">
                {[
                  { ref: fileInputRefs.ci, label: 'Carta d\'Identità' },
                  { ref: fileInputRefs.patente, label: 'Patente di Guida' },
                  { ref: fileInputRefs.cf, label: 'Codice Fiscale' }
                ].map((input, idx) => (
                  <div key={idx} className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 ml-1">{input.label}</label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        ref={input.ref}
                        className="block w-full text-xs text-neutral-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-neutral-800 file:text-neutral-300 hover:file:bg-neutral-700 transition-all cursor-pointer bg-neutral-950 border border-neutral-800 rounded-2xl"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleSaveArchive}
                disabled={isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 py-4 rounded-2xl font-bold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
              >
                {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Salva nell'Archivio
              </button>

              <button 
                onClick={() => setView('home')}
                className="w-full py-3 text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Annulla
              </button>
            </div>
          )}

          {/* Feedback Overlay */}
          {error && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
              <p className="text-sm font-medium text-blue-200">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-blue-500 hover:text-blue-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center space-y-4">
          <div className="flex items-center justify-center gap-6 opacity-40">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full border border-neutral-700 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tighter">Privacy</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full border border-neutral-700 flex items-center justify-center">
                <RefreshCw className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tighter">P2P</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full border border-neutral-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tighter">Sicuro</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
