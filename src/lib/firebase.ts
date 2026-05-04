import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function loginAnonymously() {
    // Disabled auth requirement to avoid admin-restricted-operation if not enabled in console
    return Promise.resolve();
}

export interface LeaderboardEntry {
    uid: string;
    displayName: string;
    score: number;
    timestamp: any;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
        const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
        const s = await getDocs(q);
        return s.docs.map(d => d.data() as LeaderboardEntry);
    } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'leaderboard');
        return [];
    }
}

export async function submitScore(displayName: string, score: number) {
    let uid = localStorage.getItem('player_uid');
    if (!uid) {
        uid = 'guest_' + Math.random().toString(36).substring(2, 12);
        localStorage.setItem('player_uid', uid);
    }
    const ref = doc(db, 'leaderboard', uid);
    
    try {
        const existing = await getDoc(ref);
        if (existing.exists()) {
            const data = existing.data() as LeaderboardEntry;
            if (score <= data.score) return; // Don't override with lower score
        }
        
        await setDoc(ref, {
            uid,
            displayName,
            score,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `leaderboard/${uid}`);
    }
}
