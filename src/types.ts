export type SessionState = 
  | 'pending_donor_upload'   // Step 1: Receiver generated Receiver Code (4 digits) with custom message
  | 'pending_receiver_unlock' // Step 2-3: Donor saw message, attached file, generated Donor Code (4 digits)
  | 'unlocked'                // Step 4: Receiver entered Donor Code, file available to download
  | 'purged'                  // File downloaded & auto-destroyed from server
  | 'revoked'                 // Donor pressed Kill Switch
  | 'expired';                // Timer ran out

export interface EphemeralSession {
  id: string;
  receiverMessage: string;
  receiverCode: string;             // 4 digits
  receiverCodeCreatedAt: number;
  receiverCodeExpiresAt: number;
  donorCode?: string;               // 4 digits
  donorCodeCreatedAt?: number;
  donorCodeExpiresAt?: number;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  fileDataUrl?: string;             // Encrypted payload or raw data
  fileUrl?: string;                 // Download endpoint URL
  isEncrypted?: boolean;            // true for E2EE, false for Direct Transfer
  quickCode?: string;               // 4 digits for Direct Transfer mode
  status: SessionState;
  unlockedAt?: number;
  unlockedExpiresAt?: number;
  purgedAt?: number;
  createdAt: number;
}
