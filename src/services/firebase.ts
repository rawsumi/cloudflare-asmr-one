import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';
import { TranslatedWorkRecord, TranslateResult } from './translator';

const firebaseConfig = {
  projectId: firebaseConfigData.projectId,
  appId: firebaseConfigData.appId,
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(
  app,
  firebaseConfigData.firestoreDatabaseId || '(default)'
);

// Connection verification test
export async function validateFirebaseConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'status'));
    console.log('✓ Connected to Firebase Firestore database');
    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase Firestore client is offline.');
      return false;
    }
    // Document might not exist, but connection succeeded
    return true;
  }
}

// Helper: Sanitize object keys and undefined values for Firestore
function sanitizeForFirestore(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    // Sanitize slash in key names
    const safeKey = k.replace(/\//g, '_');
    clean[safeKey] = typeof v === 'object' ? sanitizeForFirestore(v) : v;
  }
  return clean;
}

/**
 * Save a translated work record permanently into Firestore
 */
export async function saveTranslatedWorkToFirestore(
  record: TranslatedWorkRecord
): Promise<boolean> {
  try {
    const key = String(record.rjCode || record.id).toUpperCase();
    if (!key) return false;

    const docRef = doc(db, 'translated_works', key);
    const cleanData = sanitizeForFirestore({
      ...record,
      id: String(record.id || record.rjCode),
      rjCode: String(record.rjCode || record.id).toUpperCase(),
      updatedAt: new Date().toISOString(),
    });

    await setDoc(docRef, cleanData, { merge: true });
    return true;
  } catch (err) {
    console.warn('Failed to save translated work to Firestore:', err);
    return false;
  }
}

/**
 * Get all permanent translated works from Firestore
 */
export async function getTranslatedWorksFromFirestore(
  lang: 'all' | 'en' | 'vi' = 'all',
  searchQuery: string = ''
): Promise<TranslatedWorkRecord[]> {
  try {
    const colRef = collection(db, 'translated_works');
    const snapshot = await getDocs(colRef);
    let records: TranslatedWorkRecord[] = [];

    snapshot.forEach((d) => {
      const data = d.data() as TranslatedWorkRecord;
      if (data && (data.rjCode || data.id)) {
        records.push(data);
      }
    });

    // Sort by latest translatedAt
    records.sort(
      (a, b) =>
        new Date(b.translatedAt || 0).getTime() -
        new Date(a.translatedAt || 0).getTime()
    );

    if (lang !== 'all') {
      records = records.filter((r) => Boolean(r.translatedTitle?.[lang]));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      records = records.filter((r) => {
        const matchRj = String(r.rjCode || '').toLowerCase().includes(q);
        const matchOrig = String(r.originalTitle || '').toLowerCase().includes(q);
        const matchEn = String(r.translatedTitle?.en || '').toLowerCase().includes(q);
        const matchVi = String(r.translatedTitle?.vi || '').toLowerCase().includes(q);
        const matchCircle = String(r.circle || '').toLowerCase().includes(q);
        const matchVa = String(r.vas || '').toLowerCase().includes(q);
        return matchRj || matchOrig || matchEn || matchVi || matchCircle || matchVa;
      });
    }

    return records;
  } catch (err) {
    console.warn('Failed to load translated works from Firestore:', err);
    return [];
  }
}

/**
 * Get a single permanently translated work by ID or RJ code from Firestore
 */
export async function getTranslatedWorkFromFirestore(
  idOrRj: string
): Promise<TranslatedWorkRecord | null> {
  try {
    const clean = String(idOrRj || '').trim().toUpperCase();
    if (!clean) return null;

    const directRef = doc(db, 'translated_works', clean);
    const snap = await getDoc(directRef);
    if (snap.exists()) {
      return snap.data() as TranslatedWorkRecord;
    }

    // Try without RJ prefix or with RJ prefix
    const withoutRj = clean.replace(/^RJ/i, '');
    const withRj = `RJ${withoutRj}`;

    const altSnap = await getDoc(doc(db, 'translated_works', withRj));
    if (altSnap.exists()) {
      return altSnap.data() as TranslatedWorkRecord;
    }

    const numSnap = await getDoc(doc(db, 'translated_works', withoutRj));
    if (numSnap.exists()) {
      return numSnap.data() as TranslatedWorkRecord;
    }
  } catch (err) {
    console.warn('Failed to fetch translated work from Firestore:', err);
  }
  return null;
}

/**
 * Save title / track translations into global Firestore dictionary
 */
export async function saveTitleTranslationsToFirestore(
  translations: Record<string, string>,
  targetLang: 'en' | 'vi'
): Promise<void> {
  try {
    const entries = Object.entries(translations);
    for (const [orig, trans] of entries) {
      const cleanOrig = (orig || '').trim();
      const cleanTrans = (trans || '').trim();
      if (!cleanOrig || !cleanTrans || cleanOrig === cleanTrans) continue;

      // Hash or sanitize document ID
      const docId = cleanOrig.slice(0, 100).replace(/[/.\s#$\[\]]/g, '_');
      const docRef = doc(db, 'title_translations', docId);

      await setDoc(
        docRef,
        {
          originalText: cleanOrig,
          [targetLang]: cleanTrans,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('Failed to save title translations to Firestore:', err);
  }
}

/**
 * Batch fetch title translations from Firestore
 */
export async function getCachedTitlesFromFirestore(
  texts: string[],
  targetLang: 'en' | 'vi'
): Promise<{ cached: Record<string, string>; missing: string[] }> {
  const cached: Record<string, string> = {};
  const missing: string[] = [];

  try {
    for (const raw of texts) {
      const trimmed = (raw || '').trim();
      if (!trimmed) continue;

      const docId = trimmed.slice(0, 100).replace(/[/.\s#$\[\]]/g, '_');
      const docRef = doc(db, 'title_translations', docId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data && data[targetLang] && data[targetLang] !== trimmed) {
          cached[trimmed] = data[targetLang];
        } else {
          missing.push(trimmed);
        }
      } else {
        missing.push(trimmed);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch cached titles from Firestore:', err);
    return { cached: {}, missing: texts };
  }

  return { cached, missing };
}

/**
 * Save script translation into Firestore
 */
export async function saveScriptTranslationToFirestore(
  cacheKey: string,
  result: TranslateResult
): Promise<void> {
  try {
    if (!cacheKey || !result.translatedText) return;
    const docId = cacheKey.replace(/[/.\s#$\[\]]/g, '_');
    const docRef = doc(db, 'script_translations', docId);

    await setDoc(docRef, {
      ...sanitizeForFirestore(result),
      cacheKey,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to save script translation to Firestore:', err);
  }
}

/**
 * Get script translation from Firestore
 */
export async function getCachedScriptFromFirestore(
  cacheKey: string
): Promise<TranslateResult | null> {
  try {
    if (!cacheKey) return null;
    const docId = cacheKey.replace(/[/.\s#$\[\]]/g, '_');
    const docRef = doc(db, 'script_translations', docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return snap.data() as TranslateResult;
    }
  } catch (err) {
    console.warn('Failed to fetch script translation from Firestore:', err);
  }
  return null;
}
