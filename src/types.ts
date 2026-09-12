export type SessionState = 
  | 'pending_donor_upload'   // Step 1: Receiver generated Receiver Code (4 digits, 2 mins) with custom message
  | 'pending_receiver_unlock' // Step 2-3: Donor saw message, attached file, generated Donor Code (4 digits, 2 mins)
  | 'unlocked'                // Step 4: Receiver entered Donor Code, file available to download (10 mins)
  | 'revoked'                 // Donor pressed Kill Switch
  | 'expired';                // 2-min or 10-min timer ran out

export interface EphemeralSession {
  id: string;
  receiverMessage: string;
  receiverCode: string;             // 4 digits (2 mins)
  receiverCodeCreatedAt: number;
  receiverCodeExpiresAt: number;
  donorCode?: string;               // 4 digits (2 mins)
  donorCodeCreatedAt?: number;
  donorCodeExpiresAt?: number;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  fileDataUrl?: string;             // Base64 or mock blob in memory
  status: SessionState;
  unlockedAt?: number;
  unlockedExpiresAt?: number;       // 10 mins
  createdAt: number;
}
