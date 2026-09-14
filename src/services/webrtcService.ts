import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  getDoc,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SignalMessage {
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  sender: string;
}

export class WebRTCService {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;
  private onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;
  private receivedChunks: Map<string, { chunks: string[], total: number }> = new Map();

  constructor() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    this.pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };
  }

  get connectionState() {
    return this.pc.connectionState;
  }

  setOnMessage(callback: (data: any) => void) {
    this.onMessageCallback = callback;
  }

  setConnectionStateChange(callback: (state: RTCPeerConnectionState) => void) {
    this.onConnectionStateChange = callback;
  }

  async createOffer(sessionId: string, senderId: string) {
    this.dataChannel = this.pc.createDataChannel('fileTransfer', { ordered: true });
    this.setupDataChannel();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const signalingRef = doc(db, 'sessions', sessionId, 'signaling', 'offer');
    await setDoc(signalingRef, {
      type: 'offer',
      payload: JSON.stringify(offer),
      sender: senderId,
      timestamp: Date.now(),
    });

    // Listen for candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateRef = doc(db, 'sessions', sessionId, 'signaling', `cand_${senderId}_${Math.random().toString(36).substring(2, 7)}`);
        setDoc(candidateRef, {
          type: 'candidate',
          payload: JSON.stringify(event.candidate),
          sender: senderId,
          timestamp: Date.now(),
        });
      }
    };

    // Listen for answer
    const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId, 'signaling', 'answer'), (snapshot) => {
      const data = snapshot.data();
      if (data && data.type === 'answer') {
        const answer = JSON.parse(data.payload);
        this.pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
        unsubscribe();
      }
    });

    // Process remote candidates
    onSnapshot(collection(db, 'sessions', sessionId, 'signaling'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.type === 'candidate' && data.sender !== senderId) {
            try {
              const candidate = JSON.parse(data.payload);
              this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
                // Ignore stale candidates
              });
            } catch (e) {}
          }
        }
      });
    });

    return unsubscribe;
  }

  async handleOffer(sessionId: string, senderId: string, offerPayload: string) {
    const offer = JSON.parse(offerPayload);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const signalingRef = doc(db, 'sessions', sessionId, 'signaling', 'answer');
    await setDoc(signalingRef, {
      type: 'answer',
      payload: JSON.stringify(answer),
      sender: senderId,
      timestamp: Date.now(),
    });

    // Listen for candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateRef = doc(db, 'sessions', sessionId, 'signaling', `cand_${senderId}_${Math.random().toString(36).substring(2, 7)}`);
        setDoc(candidateRef, {
          type: 'candidate',
          payload: JSON.stringify(event.candidate),
          sender: senderId,
          timestamp: Date.now(),
        });
      }
    };

    // Process remote candidates
    onSnapshot(collection(db, 'sessions', sessionId, 'signaling'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.type === 'candidate' && data.sender !== senderId) {
            try {
              const candidate = JSON.parse(data.payload);
              this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
                // Ignore stale
              });
            } catch (e) {}
          }
        }
      });
    });
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;

    this.dataChannel.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'file_chunk') {
        const { fileId, chunk, index, total } = msg;
        if (!this.receivedChunks.has(fileId)) {
          this.receivedChunks.set(fileId, { chunks: new Array(total), total });
        }
        const state = this.receivedChunks.get(fileId)!;
        state.chunks[index] = chunk;
        
        // Check if complete
        const receivedCount = state.chunks.filter(c => c !== undefined).length;
        if (this.onMessageCallback) {
          this.onMessageCallback({ 
            type: 'progress', 
            fileId, 
            progress: Math.round((receivedCount / total) * 100) 
          });
        }

        if (receivedCount === total) {
          const fullData = state.chunks.join('');
          this.receivedChunks.delete(fileId);
          if (this.onMessageCallback) {
            this.onMessageCallback({ type: 'file_complete', fileId, data: fullData });
          }
        }
      } else if (this.onMessageCallback) {
        this.onMessageCallback(msg);
      }
    };

    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel opened');
      if (this.onMessageCallback) this.onMessageCallback({ type: 'channel_open' });
    };
    this.dataChannel.onclose = () => console.log('[WebRTC] Data channel closed');
  }

  send(data: any) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    } else {
      console.warn('[WebRTC] Data channel not ready');
    }
  }

  async sendFile(fileId: string, dataUrl: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

    const chunkSize = 16384; // 16KB for stability
    const total = Math.ceil(dataUrl.length / chunkSize);

    for (let i = 0; i < total; i++) {
      const chunk = dataUrl.substring(i * chunkSize, (i + 1) * chunkSize);
      this.send({
        type: 'file_chunk',
        fileId,
        chunk,
        index: i,
        total
      });
      // Small delay to prevent overflow in some browsers if sending very fast
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 1));
      }
    }
  }

  close() {
    this.pc.close();
  }
}
