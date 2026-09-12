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
  fileDataUrl?: string;             // Base64 encrypted payload
  fileUrl?: string;                 // Download endpoint URL
  status: SessionState;
  unlockedAt?: number;
  unlockedExpiresAt?: number;
  purgedAt?: number;
  createdAt: number;
}
