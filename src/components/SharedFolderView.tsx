import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderSync, 
  Plus, 
  File, 
  Download, 
  Trash2, 
  Clock, 
  Share2, 
  AlertCircle,
  Loader2,
  X,
  Copy,
  CheckCircle2
} from 'lucide-react';
import { SharedFolder, SharedFile } from '../types';
import { 
  createSharedFolder, 
  joinSharedFolder, 
  addFileToSharedFolder, 
  removeFileFromSharedFolder, 
  subscribeToSharedFolder,
  fetchFileChunks
} from '../services/apiService';

export const SharedFolderView: React.FC = () => {
  const [folder, setFolder] = useState<SharedFolder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleQuota = () => {
      setError('Limite giornaliero Firebase raggiunto (Quota Exceeded). Il sistema è in modalità limitata. Riprova tra 5 minuti o domani.');
    };
    window.addEventListener('safehandshake_quota_exceeded', handleQuota);
    return () => window.removeEventListener('safehandshake_quota_exceeded', handleQuota);
  }, []);

  useEffect(() => {
    if (!folder) return;

    const unsubscribe = subscribeToSharedFolder(folder.id, (updatedFolder) => {
      setFolder(updatedFolder);
    });

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = folder.expiresAt - now;
      if (diff <= 0) {
        setTimeLeft('Scaduta');
        setFolder(prev => prev ? { ...prev, status: 'expired' } : null);
        clearInterval(timer);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [folder?.id]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    const newFolder = await createSharedFolder();
    if (newFolder) {
      setFolder(newFolder);
    } else {
      setError('Impossibile creare la cartella. Riprova.');
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (inputCode.length !== 4) return;
    setLoading(true);
    setError(null);
    const joinedFolder = await joinSharedFolder(inputCode);
    if (joinedFolder) {
      setFolder(joinedFolder);
    } else {
      setError('Codice non valido o cartella scaduta.');
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !folder) return;

    if (folder.files.length >= 5) {
      setError('Limite di 5 file raggiunto.');
      return;
    }

    setUploading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const donorId = Math.random().toString(36).substring(7); // Temporary identity
      const success = await addFileToSharedFolder(folder.id, file, dataUrl, donorId);
      if (!success) {
        setError('Errore durante l\'upload.');
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (fileId: string) => {
    if (!folder) return;
    await removeFileFromSharedFolder(folder.id, fileId);
  };

  const handleDownload = async (file: SharedFile) => {
    if (!folder) return;
    setDownloadingId(file.id);
    setError(null);

    try {
      let dataUrl = file.fileDataUrl;

      // Se il dataUrl è vuoto, tentiamo di recuperare i chunk da Firestore
      if (!dataUrl) {
        dataUrl = await fetchFileChunks(folder.id, file.id);
      }

      if (dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || file.type || 'application/octet-stream';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setDownloadingId(null);
        return;
      }
    } catch (e) {
      console.error('Error creating blob for download:', e);
    }
    
    // Fallback to server download
    const link = document.createElement('a');
    link.href = `/api/folder/${folder?.id}/file/${file.id}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadingId(null);
  };

  const copyCode = () => {
    if (!folder) return;
    navigator.clipboard.writeText(folder.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!folder) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-indigo-50 rounded-2xl mb-4">
            <FolderSync className="w-10 h-10 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Cartella Condivisa</h2>
          <p className="text-slate-500 mt-2">Scambio rapido fino a 5 file in tempo reale.</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-200"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Crea Nuova Cartella
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow h-px bg-slate-200"></div>
            <span className="px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Oppure Entra</span>
            <div className="flex-grow h-px bg-slate-200"></div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              maxLength={4}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Codice 4 cifre"
              className="flex-grow p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-xl font-mono font-bold text-slate-900 placeholder:text-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition-all"
            />
            <button
              onClick={handleJoin}
              disabled={loading || inputCode.length !== 4}
              className={`px-6 font-bold rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 ${
                inputCode.length === 4 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                  : 'bg-slate-900 text-white'
              }`}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entra'}
            </button>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-100"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-700 text-xs flex gap-3">
            <Clock className="w-5 h-5 flex-shrink-0" />
            <p>Le cartelle durano 10 minuti. Tutti i file vengono eliminati automaticamente alla scadenza.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl">
            <FolderSync className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Cartella Condivisa</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                <Clock className="w-3.5 h-3.5" />
                <span>Scade tra: <span className="text-indigo-400 font-mono font-bold">{timeLeft}</span></span>
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-700"></div>
              <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                Spazio Collaborativo
              </div>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setFolder(null)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Codice Accesso</span>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-mono font-black text-indigo-900 tracking-tighter">{folder.code}</span>
            <button 
              onClick={copyCode}
              className="p-2 hover:bg-white rounded-lg transition-all text-indigo-600"
            >
              {copied ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Capacità</span>
          <div className="text-lg font-bold text-indigo-900">{folder.files.length}/5 File</div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-bold text-slate-900 uppercase text-xs tracking-widest">File In Cartella</h4>
          {folder.files.length < 5 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Aggiungi File
            </button>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />

        <div className="space-y-3 min-h-[200px]">
          <AnimatePresence mode="popLayout">
            {folder.files.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl"
              >
                <Share2 className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Ancora nessun file. Inizia a condividere!</p>
              </motion.div>
            ) : (
              folder.files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors">
                      <File className="w-6 h-6 text-slate-400 group-hover:text-indigo-500" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-bold text-slate-900 truncate pr-2">{file.name}</p>
                      <p className="text-xs text-slate-400 font-medium">{formatSize(file.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(file)}
                      disabled={downloadingId === file.id}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {downloadingId === file.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {error && (
          <div className="mt-6 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100 text-center">
            {error}
          </div>
        )}
      </div>

      <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">SafeHandshake • Cartella Ephemera</p>
      </div>
    </div>
  );
};
