/**
 * GecolaShare End-to-End Encryption (E2EE) Core Module
 * Powered by Web Crypto API (AES-256-GCM) with double PIN code handshake key derivation.
 * No unencrypted data ever touches the wire or server!
 */

// Derive a 256-bit AES-GCM CryptoKey from receiverCode + donorCode
async function deriveKey(receiverCode: string, donorCode: string): Promise<CryptoKey> {
  // Normalize codes: 4 digits, trimmed, uppercase (if any letters were to be added)
  const rCode = receiverCode.trim().substring(0, 4);
  const dCode = donorCode.trim().substring(0, 4);
  
  const secretString = `GECOLASHARE_E2EE_${rCode}_${dCode}_2026@AETERNA`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretString);

  // Digest with SHA-256 to get a fixed 32-byte (256-bit) key
  const hash = await window.crypto.subtle.digest('SHA-256', keyData);

  return window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a Data URL (or ArrayBuffer string) using AES-256-GCM
 * Returns base64 payload containing IV (12 bytes) + Ciphertext + Auth Tag
 */
export async function encryptPayload(dataUrl: string, receiverCode: string, donorCode: string): Promise<string> {
  try {
    const key = await deriveKey(receiverCode, donorCode);
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(dataUrl);

    // Generate random 12-byte Initialization Vector (IV)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    // Combine IV (12 bytes) + Ciphertext
    const combined = new Uint8Array(iv.byteLength + ciphertextBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertextBuffer), iv.byteLength);

    // Convert to Base64
    let binary = '';
    const bytes = combined;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return 'E2EE:' + btoa(binary);
  } catch (err) {
    console.error('[E2EE] Encryption failed:', err);
    throw new Error('Errore durante la cifratura End-to-End del file.');
  }
}

/**
 * Decrypts an encrypted payload using AES-256-GCM
 */
export async function decryptPayload(encryptedString: string, receiverCode: string, donorCode: string): Promise<string> {
  try {
    if (!encryptedString.startsWith('E2EE:')) {
      // Legacy unencrypted fallback
      return encryptedString;
    }

    const base64Data = encryptedString.replace('E2EE:', '');
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Extract 12-byte IV and Ciphertext
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const key = await deriveKey(receiverCode, donorCode);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error('[E2EE] Decryption failed:', err);
    throw new Error('Impossibile decifrare il file. I codici di sicurezza non corrispondono.');
  }
}
