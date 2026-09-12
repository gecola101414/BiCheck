/**
 * GecolaShare Local Vault
 * Stores frequent documents (e.g. Carta d'Identità, Patente, Codice Fiscale)
 * strictly inside client-side browser LocalStorage.
 * NOTHING is stored on the server!
 */

export interface VaultFile {
  id: string;
  name: string;
  size: string;
  type: string;
  dataUrl: string;
  savedAt: number;
}

const VAULT_STORAGE_KEY = 'gecolashare_frequent_vault_2026';

export function getVaultFiles(): VaultFile[] {
  try {
    const data = localStorage.getItem(VAULT_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveFileToVault(file: { name: string; size: string; type: string; dataUrl: string }): VaultFile[] {
  const current = getVaultFiles();
  const newEntry: VaultFile = {
    id: 'vault_' + Math.random().toString(36).substring(2, 9),
    name: file.name,
    size: file.size,
    type: file.type,
    dataUrl: file.dataUrl,
    savedAt: Date.now()
  };

  // Keep max 6 recent frequent documents
  const updated = [newEntry, ...current.filter(f => f.name !== file.name)].slice(0, 6);
  
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Vault] Storage limit reached for local vault:', err);
  }
  return updated;
}

export function deleteFromVault(id: string): VaultFile[] {
  const current = getVaultFiles();
  const updated = current.filter(f => f.id !== id);
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}
