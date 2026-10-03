// server.ts
import express from "express";
import path2 from "path";
import fs2 from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";

// src/services/translator.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// src/services/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs
} from "firebase/firestore";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "gen-lang-client-0620935356",
  appId: "1:68876128823:web:c634d97e6f7d4e3123e5b2",
  apiKey: "AIzaSyCELgR7Qov-njnhq7bymfdOaD-uxPFPB2A",
  authDomain: "gen-lang-client-0620935356.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-retroasmroperami-8261b598-2b39-4894-9b33-0284f5ddf7f8",
  storageBucket: "gen-lang-client-0620935356.firebasestorage.app",
  messagingSenderId: "68876128823",
  measurementId: "",
  oAuthClientId: "68876128823-h974n4f3o25ermr7v5tj5b62os7an07g.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// src/services/firebase.ts
var firebaseConfig = {
  projectId: firebase_applet_config_default.projectId,
  appId: firebase_applet_config_default.appId,
  apiKey: firebase_applet_config_default.apiKey,
  authDomain: firebase_applet_config_default.authDomain,
  storageBucket: firebase_applet_config_default.storageBucket,
  messagingSenderId: firebase_applet_config_default.messagingSenderId
};
var app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
var db = getFirestore(
  app,
  firebase_applet_config_default.firestoreDatabaseId || "(default)"
);
async function validateFirebaseConnection() {
  try {
    await getDocFromServer(doc(db, "_connection_test", "status"));
    console.log("\u2713 Connected to Firebase Firestore database");
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firebase Firestore client is offline.");
      return false;
    }
    return true;
  }
}
function sanitizeForFirestore(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0) continue;
    const safeKey = k.replace(/\//g, "_");
    clean[safeKey] = typeof v === "object" ? sanitizeForFirestore(v) : v;
  }
  return clean;
}
async function saveTranslatedWorkToFirestore(record) {
  try {
    const key = String(record.rjCode || record.id).toUpperCase();
    if (!key) return false;
    const docRef = doc(db, "translated_works", key);
    const cleanData = sanitizeForFirestore({
      ...record,
      id: String(record.id || record.rjCode),
      rjCode: String(record.rjCode || record.id).toUpperCase(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await setDoc(docRef, cleanData, { merge: true });
    return true;
  } catch (err) {
    console.warn("Failed to save translated work to Firestore:", err);
    return false;
  }
}
async function getTranslatedWorksFromFirestore(lang = "all", searchQuery = "") {
  try {
    const colRef = collection(db, "translated_works");
    const snapshot = await getDocs(colRef);
    let records = [];
    snapshot.forEach((d) => {
      const data = d.data();
      if (data && (data.rjCode || data.id)) {
        records.push(data);
      }
    });
    records.sort(
      (a, b) => new Date(b.translatedAt || 0).getTime() - new Date(a.translatedAt || 0).getTime()
    );
    if (lang !== "all") {
      records = records.filter((r) => Boolean(r.translatedTitle?.[lang]));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      records = records.filter((r) => {
        const matchRj = String(r.rjCode || "").toLowerCase().includes(q);
        const matchOrig = String(r.originalTitle || "").toLowerCase().includes(q);
        const matchEn = String(r.translatedTitle?.en || "").toLowerCase().includes(q);
        const matchVi = String(r.translatedTitle?.vi || "").toLowerCase().includes(q);
        const matchCircle = String(r.circle || "").toLowerCase().includes(q);
        const matchVa = String(r.vas || "").toLowerCase().includes(q);
        return matchRj || matchOrig || matchEn || matchVi || matchCircle || matchVa;
      });
    }
    return records;
  } catch (err) {
    console.warn("Failed to load translated works from Firestore:", err);
    return [];
  }
}
async function saveTitleTranslationsToFirestore(translations, targetLang) {
  try {
    const entries = Object.entries(translations);
    for (const [orig, trans] of entries) {
      const cleanOrig = (orig || "").trim();
      const cleanTrans = (trans || "").trim();
      if (!cleanOrig || !cleanTrans || cleanOrig === cleanTrans) continue;
      const docId = cleanOrig.slice(0, 100).replace(/[/.\s#$\[\]]/g, "_");
      const docRef = doc(db, "title_translations", docId);
      await setDoc(
        docRef,
        {
          originalText: cleanOrig,
          [targetLang]: cleanTrans,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn("Failed to save title translations to Firestore:", err);
  }
}
async function saveScriptTranslationToFirestore(cacheKey, result) {
  try {
    if (!cacheKey || !result.translatedText) return;
    const docId = cacheKey.replace(/[/.\s#$\[\]]/g, "_");
    const docRef = doc(db, "script_translations", docId);
    await setDoc(docRef, {
      ...sanitizeForFirestore(result),
      cacheKey,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.warn("Failed to save script translation to Firestore:", err);
  }
}

// src/services/translator.ts
var CACHE_FILE_PATH = path.join(process.cwd(), "title_translations_cache.json");
var WORKS_VAULT_FILE_PATH = path.join(process.cwd(), "translated_works_vault.json");
var SCRIPT_CACHE_FILE_PATH = path.join(process.cwd(), "script_translations_cache.json");
var titleTranslationServerCache = /* @__PURE__ */ new Map();
var translatedWorksVault = /* @__PURE__ */ new Map();
var scriptTranslationServerCache = /* @__PURE__ */ new Map();
var MAX_SCRIPT_CACHE_ITEMS = 5e3;
try {
  if (fs.existsSync(SCRIPT_CACHE_FILE_PATH)) {
    const raw = fs.readFileSync(SCRIPT_CACHE_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === "object") {
          scriptTranslationServerCache.set(k, v);
        }
      }
    }
  }
} catch (loadErr) {
  console.warn("Could not load persistent script translation cache from disk:", loadErr);
}
try {
  if (fs.existsSync(CACHE_FILE_PATH)) {
    const raw = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === "object") {
          titleTranslationServerCache.set(k, v);
        }
      }
    }
  }
} catch (loadErr) {
  console.warn("Could not load persistent title translation cache from disk:", loadErr);
}
try {
  if (fs.existsSync(WORKS_VAULT_FILE_PATH)) {
    const raw = fs.readFileSync(WORKS_VAULT_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && (item.rjCode || item.id)) {
          const key = String(item.rjCode || item.id).toUpperCase();
          translatedWorksVault.set(key, item);
        }
      }
    }
  }
} catch (loadErr) {
  console.warn("Could not load persistent translated works vault from disk:", loadErr);
}
function persistTitleCacheToDisk() {
  try {
    const obj = {};
    for (const [k, v] of titleTranslationServerCache.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to save title translation cache to disk:", err);
  }
}
function persistWorksVaultToDisk() {
  try {
    const list = Array.from(translatedWorksVault.values());
    fs.writeFileSync(WORKS_VAULT_FILE_PATH, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to save translated works vault to disk:", err);
  }
}
function uploadTitleTranslations(translations, targetLang, workInfo) {
  const cleanLang = targetLang === "vi" ? "vi" : "en";
  let addedCount = 0;
  for (const [orig, trans] of Object.entries(translations)) {
    const cleanOrig = (orig || "").trim();
    const cleanTrans = (trans || "").trim();
    if (!cleanOrig || !cleanTrans || cleanOrig === cleanTrans) continue;
    const existing = titleTranslationServerCache.get(cleanOrig) || {};
    existing[cleanLang] = cleanTrans;
    titleTranslationServerCache.set(cleanOrig, existing);
    addedCount++;
  }
  if (addedCount > 0) {
    persistTitleCacheToDisk();
    saveTitleTranslationsToFirestore(translations, cleanLang).catch(() => {
    });
  }
  if (workInfo && (workInfo.rjCode || workInfo.id || workInfo.originalTitle)) {
    const rawRj = workInfo.rjCode || (workInfo.id ? `RJ${String(workInfo.id).replace(/^RJ/i, "")}` : "");
    const key = String(rawRj || workInfo.id || workInfo.originalTitle || "WORK").toUpperCase();
    const existingWork = translatedWorksVault.get(key) || {
      id: workInfo.id || key,
      rjCode: rawRj || key,
      originalTitle: workInfo.originalTitle || "",
      translatedTitle: {},
      translatedTracksCount: 0,
      totalTracksCount: workInfo.totalTracks || 0,
      translatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      coverUrl: workInfo.coverUrl || "",
      circle: workInfo.circle || "",
      vas: workInfo.vas || "",
      trackTranslations: {}
    };
    if (!existingWork.trackTranslations) {
      existingWork.trackTranslations = {};
    }
    if (workInfo.originalTitle) {
      existingWork.originalTitle = workInfo.originalTitle;
      const directTrans = translations[workInfo.originalTitle];
      if (directTrans) {
        existingWork.translatedTitle[cleanLang] = directTrans;
      } else {
        const cached = titleTranslationServerCache.get(workInfo.originalTitle);
        if (cached?.[cleanLang]) {
          existingWork.translatedTitle[cleanLang] = cached[cleanLang];
        }
      }
    }
    for (const [orig, trans] of Object.entries(translations)) {
      if (orig === workInfo.originalTitle) continue;
      const cleanOrig = orig.trim();
      const cleanTrans = trans.trim();
      if (!cleanOrig || !cleanTrans || cleanOrig === cleanTrans) continue;
      if (!existingWork.trackTranslations[cleanOrig]) {
        existingWork.trackTranslations[cleanOrig] = {};
      }
      existingWork.trackTranslations[cleanOrig][cleanLang] = cleanTrans;
    }
    if (workInfo.coverUrl) existingWork.coverUrl = workInfo.coverUrl;
    if (workInfo.circle) existingWork.circle = workInfo.circle;
    if (workInfo.vas) existingWork.vas = workInfo.vas;
    if (workInfo.totalTracks) existingWork.totalTracksCount = workInfo.totalTracks;
    const trackKeys = Object.keys(existingWork.trackTranslations);
    const validTracksCount = trackKeys.filter((k) => Boolean(existingWork.trackTranslations[k].en || existingWork.trackTranslations[k].vi)).length;
    existingWork.translatedTracksCount = Math.max(existingWork.translatedTracksCount, validTracksCount);
    existingWork.translatedAt = (/* @__PURE__ */ new Date()).toISOString();
    translatedWorksVault.set(key, existingWork);
    persistWorksVaultToDisk();
    saveTranslatedWorkToFirestore(existingWork).catch(() => {
    });
  }
  return {
    count: addedCount,
    totalCached: titleTranslationServerCache.size,
    totalWorks: translatedWorksVault.size
  };
}
function getPermanentTranslatedWorks(lang = "all", searchQuery = "") {
  let records = Array.from(translatedWorksVault.values());
  records.sort((a, b) => new Date(b.translatedAt).getTime() - new Date(a.translatedAt).getTime());
  if (lang !== "all") {
    records = records.filter((r) => Boolean(r.translatedTitle?.[lang]));
  }
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    records = records.filter((r) => {
      const matchRj = String(r.rjCode || "").toLowerCase().includes(q);
      const matchOrig = String(r.originalTitle || "").toLowerCase().includes(q);
      const matchEn = String(r.translatedTitle?.en || "").toLowerCase().includes(q);
      const matchVi = String(r.translatedTitle?.vi || "").toLowerCase().includes(q);
      const matchCircle = String(r.circle || "").toLowerCase().includes(q);
      const matchVa = String(r.vas || "").toLowerCase().includes(q);
      return matchRj || matchOrig || matchEn || matchVi || matchCircle || matchVa;
    });
  }
  return records;
}
function getPermanentTranslatedWork(idOrRj) {
  const clean = String(idOrRj || "").trim().toUpperCase();
  if (!clean) return null;
  if (translatedWorksVault.has(clean)) {
    return translatedWorksVault.get(clean);
  }
  const withoutRj = clean.replace(/^RJ/i, "");
  const withRj = `RJ${withoutRj}`;
  for (const record of translatedWorksVault.values()) {
    const recRj = String(record.rjCode || "").toUpperCase();
    const recId = String(record.id || "").toUpperCase();
    if (recRj === clean || recRj === withRj || recId === clean || recId === withoutRj) {
      return record;
    }
  }
  return null;
}
function checkWorkTranslationStatus(workIdOrRj, originalTitle, trackTitles, targetLang = "en") {
  const cleanLang = targetLang === "vi" ? "vi" : "en";
  const cachedTranslations = {};
  const missingItems = [];
  const cleanTitle = (originalTitle || "").trim();
  let titleTranslated = false;
  let translatedTitle;
  if (cleanTitle) {
    const cached = titleTranslationServerCache.get(cleanTitle);
    if (cached && cached[cleanLang] && cached[cleanLang] !== cleanTitle) {
      titleTranslated = true;
      translatedTitle = cached[cleanLang];
      cachedTranslations[cleanTitle] = cached[cleanLang];
    } else {
      missingItems.push(cleanTitle);
    }
  }
  for (const track of trackTitles) {
    const cleanTrack = (track || "").trim();
    if (!cleanTrack) continue;
    const cached = titleTranslationServerCache.get(cleanTrack);
    if (cached && cached[cleanLang] && cached[cleanLang] !== cleanTrack) {
      cachedTranslations[cleanTrack] = cached[cleanLang];
    } else {
      if (!missingItems.includes(cleanTrack)) {
        missingItems.push(cleanTrack);
      }
    }
  }
  const allItems = [cleanTitle, ...trackTitles.map((t) => (t || "").trim())].filter(Boolean);
  const uniqueItems = Array.from(new Set(allItems));
  const totalItems = uniqueItems.length;
  const translatedCount = totalItems - missingItems.length;
  const isFullyTranslated = totalItems > 0 && missingItems.length === 0;
  return {
    isFullyTranslated,
    titleTranslated,
    translatedTitle,
    totalItems,
    translatedCount,
    missingCount: missingItems.length,
    missingItems,
    cachedTranslations
  };
}
function getPermanentTranslationStats() {
  const all = Array.from(translatedWorksVault.values());
  const enCount = all.filter((w) => Boolean(w.translatedTitle?.en)).length;
  const viCount = all.filter((w) => Boolean(w.translatedTitle?.vi)).length;
  return {
    totalWorks: all.length,
    enWorksCount: enCount,
    viWorksCount: viCount,
    totalTitlesCached: titleTranslationServerCache.size
  };
}
function getCachedTitlesBatch(texts, targetLang) {
  const cleanLang = targetLang === "vi" ? "vi" : "en";
  const cached = {};
  const missing = [];
  for (const raw of texts) {
    const trimmed = (raw || "").trim();
    if (!trimmed) continue;
    const entry = titleTranslationServerCache.get(trimmed);
    if (entry && entry[cleanLang] && entry[cleanLang] !== trimmed) {
      cached[trimmed] = entry[cleanLang];
    } else {
      if (!missing.includes(trimmed)) {
        missing.push(trimmed);
      }
    }
  }
  return { cached, missing };
}
function persistScriptCacheToDisk() {
  try {
    const obj = {};
    for (const [k, v] of scriptTranslationServerCache.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SCRIPT_CACHE_FILE_PATH, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to save script translation cache to disk:", err);
  }
}
function getScriptCacheKey(textOrHash, options = {}) {
  const isShortHash = textOrHash.length <= 64 && !textOrHash.includes("\n") && !textOrHash.includes(" ");
  const hash = isShortHash ? textOrHash.trim() : crypto.createHash("sha256").update(textOrHash.trim()).digest("hex");
  const target = (options.targetLang || "en").toLowerCase().trim();
  const mode = (options.mode || "translated").toLowerCase().trim();
  return `${hash}:${target}:${mode}`;
}
function saveScriptToCache(cacheKey, result) {
  if (scriptTranslationServerCache.size >= MAX_SCRIPT_CACHE_ITEMS) {
    const firstKey = scriptTranslationServerCache.keys().next().value;
    if (firstKey) scriptTranslationServerCache.delete(firstKey);
  }
  scriptTranslationServerCache.set(cacheKey, result);
  persistScriptCacheToDisk();
}
function getCachedScriptTranslation(cacheKey) {
  return scriptTranslationServerCache.get(cacheKey) || null;
}
function uploadScriptTranslation(params) {
  const { targetLang, mode = "translated", translatedText, sourceLang = "Auto" } = params;
  const keyToUse = params.cacheKey || getScriptCacheKey(params.rawText || params.hash || "script", { targetLang, mode });
  if (!translatedText || !translatedText.trim()) {
    return { success: false, totalCachedScripts: scriptTranslationServerCache.size, cacheKey: keyToUse };
  }
  const resultObj = {
    translatedText: translatedText.trim(),
    targetLang,
    sourceLang,
    detectedSourceLang: sourceLang,
    mode,
    charCount: translatedText.length,
    engine: "client-gemini-flash-lite"
  };
  saveScriptToCache(keyToUse, resultObj);
  saveScriptTranslationToFirestore(keyToUse, resultObj).catch(() => {
  });
  return { success: true, totalCachedScripts: scriptTranslationServerCache.size, cacheKey: keyToUse };
}
async function initFirestoreVaultSync() {
  try {
    await validateFirebaseConnection();
    const fsWorks = await getTranslatedWorksFromFirestore();
    for (const work of fsWorks) {
      if (work && (work.rjCode || work.id)) {
        const key = String(work.rjCode || work.id).toUpperCase();
        translatedWorksVault.set(key, work);
        if (work.originalTitle && work.translatedTitle) {
          const existing = titleTranslationServerCache.get(work.originalTitle) || {};
          if (work.translatedTitle.en) existing.en = work.translatedTitle.en;
          if (work.translatedTitle.vi) existing.vi = work.translatedTitle.vi;
          titleTranslationServerCache.set(work.originalTitle, existing);
        }
        if (work.trackTranslations) {
          for (const [tOrig, tMap] of Object.entries(work.trackTranslations)) {
            const existing = titleTranslationServerCache.get(tOrig) || {};
            if (tMap.en) existing.en = tMap.en;
            if (tMap.vi) existing.vi = tMap.vi;
            titleTranslationServerCache.set(tOrig, existing);
          }
        }
      }
    }
    console.log(`\u2713 Firestore vault restored: ${translatedWorksVault.size} works, ${titleTranslationServerCache.size} titles in memory.`);
  } catch (err) {
    console.warn("Firestore vault sync warning:", err);
  }
}
initFirestoreVaultSync().catch(() => {
});
function getServerTranslationCacheStats() {
  return {
    scriptCacheCount: scriptTranslationServerCache.size,
    titleCacheCount: titleTranslationServerCache.size
  };
}
function detectLanguage(text) {
  if (!text || !text.trim()) {
    return { code: "auto", name: "Auto-detected", flag: "" };
  }
  const cleanedText = text.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "").replace(/\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}/g, "").replace(/\[(?:SE|BGM|CV|Track|Scene|Chapter|Vol|No|Title|Artist|Album)[^\]]*\]/gi, "").slice(0, 4e3);
  const sample = cleanedText.trim() || text.slice(0, 3e3);
  const jpKanaMatch = sample.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  if (jpKanaMatch && jpKanaMatch.length >= 2) {
    return { code: "ja", name: "Japanese (\u65E5\u672C\u8A9E)", flag: "JP" };
  }
  const koMatch = sample.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g);
  if (koMatch && koMatch.length >= 2) {
    return { code: "ko", name: "Korean (\uD55C\uAD6D\uC5B4)", flag: "KR" };
  }
  const hanziMatch = sample.match(/[\u4E00-\u9FFF]/g);
  if (hanziMatch && hanziMatch.length >= 3) {
    const tradMatch = sample.match(/[體點與廣國變讓發無實後關門頭現動機專樣應開義過總業題邊聽經樂場隊導話術際觀帶區裏這個麼樣臺歡]/g);
    const simpMatch = sample.match(/[体点与广国变让发无实后关门头现动机专样应开义过总业题边听经乐场队导话术际观带区里这个么样台欢]/g);
    if (tradMatch && (!simpMatch || tradMatch.length > simpMatch.length)) {
      return { code: "zh-hant", name: "Traditional Chinese (\u7E41\u9AD4\u4E2D\u6587)", flag: "TW" };
    }
    return { code: "zh-hans", name: "Simplified Chinese (\u7B80\u4F53\u4E2D\u6587)", flag: "CN" };
  }
  const viMatch = sample.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/gi);
  if (viMatch && viMatch.length >= 2) {
    return { code: "vi", name: "Vietnamese (Ti\u1EBFng Vi\u1EC7t)", flag: "VI" };
  }
  const cyrMatch = sample.match(/[\u0400-\u04FF]/g);
  if (cyrMatch && cyrMatch.length >= 3) {
    return { code: "ru", name: "Russian (\u0420\u0443\u0441\u0441\u043A\u0438\u0439)", flag: "RU" };
  }
  const thaiMatch = sample.match(/[\u0E00-\u0E7F]/g);
  if (thaiMatch && thaiMatch.length >= 3) {
    return { code: "th", name: "Thai (\u0E44\u0E17\u0E22)", flag: "TH" };
  }
  if (sample.match(/[äöüßÄÖÜ]/g)) {
    return { code: "de", name: "German (Deutsch)", flag: "DE" };
  }
  if (sample.match(/[éèêëçœÉÈÊËÇ]/g)) {
    return { code: "fr", name: "French (Fran\xE7ais)", flag: "FR" };
  }
  if (sample.match(/[ñÑ¿¡áíóúÁÍÓÚ]/g)) {
    return { code: "es", name: "Spanish (Espa\xF1ol)", flag: "ES" };
  }
  if (sample.match(/[ãõâêôáéíóúçÃÕÂÊÔÁÉÍÓÚÇ]/g)) {
    return { code: "pt", name: "Portuguese (Portugu\xEAs)", flag: "PT" };
  }
  if (sample.match(/[àèéìòùÀÈÉÌÒÙ]/g)) {
    return { code: "it", name: "Italian (Italiano)", flag: "IT" };
  }
  if (/\b(?:yang|dan|di|ini|itu|untuk|dengan|kamu|aku|tidak|adalah|bisa|saya)\b/i.test(sample)) {
    return { code: "id", name: "Indonesian (Bahasa Indonesia)", flag: "ID" };
  }
  const englishMatch = sample.match(/[a-zA-Z]/g);
  if (englishMatch && englishMatch.length > 10) {
    return { code: "en", name: "English", flag: "EN" };
  }
  return { code: "auto", name: "Auto-detected", flag: "" };
}
var ASMR_GLOSSARY_EN = {
  "\u8033\u304B\u304D": "Ear Cleaning",
  "\u8033\u6383\u9664": "Ear Cleaning",
  "\u56C1\u304D": "Whispering",
  "\u3055\u3055\u3084\u304D": "Whispering",
  "\u5410\u606F": "Breathing Sounds",
  "\u6DFB\u3044\u5BDD": "Co-Sleeping",
  "\u819D\u6795": "Lap Pillow",
  "\u7518\u3005": "Sweet Pampering",
  "\u8033\u8210\u3081": "Ear Licking",
  "\u8033\u306A\u3081": "Ear Licking",
  "\u30AA\u30CA\u30B5\u30DD": "Masturbation Guidance",
  "\u5B89\u7720": "Sleep Aid",
  "\u6D17\u9AEA": "Hair Washing",
  "\u30B7\u30E3\u30F3\u30D7\u30FC": "Shampoo",
  "\u30DE\u30C3\u30B5\u30FC\u30B8": "Massage",
  "\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB": "Binaural",
  "\u7ACB\u4F53\u97F3\u97FF": "Binaural 3D Audio",
  "\u7D14\u611B": "Pure Love",
  "\u30C4\u30F3\u30C7\u30EC": "Tsundere",
  "\u30AF\u30FC\u30C7\u30EC": "Kuudere",
  "\u30E4\u30F3\u30C7\u30EC": "Yandere",
  "\u30E1\u30B9\u30AC\u30AD": "Bratty Girl",
  "\u304A\u59C9\u3061\u3083\u3093": "Older Sister",
  "\u59B9": "Little Sister",
  "\u5E7C\u99B4\u67D3": "Childhood Friend",
  "\u5F8C\u8F29": "Junior",
  "\u5148\u8F29": "Senior",
  "\u540C\u7D1A\u751F": "Classmate",
  "\u672C\u7DE8": "Main Story",
  "\u30C8\u30E9\u30C3\u30AF": "Track",
  "\u304A\u307E\u3051": "Bonus",
  "\u7279\u5178": "Special Bonus",
  "\u5F8C\u65E5\u8AC7": "After Story",
  "\u30D5\u30EA\u30FC\u30C8\u30FC\u30AF": "Free Talk",
  "\u5168\u7DE8": "Full Edition",
  "\u5C0E\u5165": "Intro",
  "\u30D7\u30ED\u30ED\u30FC\u30B0": "Prologue",
  "\u30A8\u30D4\u30ED\u30FC\u30B0": "Epilogue"
};
var ASMR_GLOSSARY_VI = {
  "\u8033\u304B\u304D": "R\xE1y tai / C\u1EA1o tai",
  "\u8033\u6383\u9664": "V\u1EC7 sinh tai",
  "\u56C1\u304D": "Th\xEC th\u1EA7m",
  "\u3055\u3055\u3084\u304D": "Th\xEC th\u1EA7m",
  "\u5410\u606F": "H\u01A1i th\u1EDF",
  "\u6DFB\u3044\u5BDD": "Ng\u1EE7 c\xF9ng / \xD4m ng\u1EE7",
  "\u819D\u6795": "G\u1ED1i \u0111\u1EA7u l\xEAn \u0111\xF9i",
  "\u7518\u3005": "Nu\xF4ng chi\u1EC1u ng\u1ECDt ng\xE0o",
  "\u8033\u8210\u3081": "Li\u1EBFm tai",
  "\u8033\u306A\u3081": "Li\u1EBFm tai",
  "\u30AA\u30CA\u30B5\u30DD": "H\u01B0\u1EDBng d\u1EABn t\u1EF1 s\u01B0\u1EDBng",
  "\u5B89\u7720": "Ng\u1EE7 ngon",
  "\u6D17\u9AEA": "G\u1ED9i \u0111\u1EA7u",
  "\u30B7\u30E3\u30F3\u30D7\u30FC": "D\u1EA7u g\u1ED9i",
  "\u30DE\u30C3\u30B5\u30FC\u30B8": "M\xE1t-xa",
  "\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB": "Binaural \xE2m thanh v\xF2m 3D",
  "\u7ACB\u4F53\u97F3\u97FF": "\xC2m thanh 3D",
  "\u7D14\u611B": "T\xECnh y\xEAu thu\u1EA7n khi\u1EBFt",
  "\u30E1\u30B9\u30AC\u30AD": "B\xE9 g\xE1i ki\xEAu ng\u1EA1o / Mesugaki",
  "\u672C\u7DE8": "Ph\u1EA7n ch\xEDnh",
  "\u30C8\u30E9\u30C3\u30AF": "Track",
  "\u304A\u307E\u3051": "Ph\u1EA7n t\u1EB7ng k\xE8m",
  "\u7279\u5178": "Ph\u1EA7n th\u01B0\u1EDFng",
  "\u5F8C\u65E5\u8AC7": "Ngo\u1EA1i truy\u1EC7n sau n\xE0y",
  "\u30D5\u30EA\u30FC\u30C8\u30FC\u30AF": "Tr\xF2 chuy\u1EC7n t\u1EF1 do",
  "\u5168\u7DE8": "To\xE0n t\u1EADp"
};
async function callGoogleTranslateGTX(query2, targetLang) {
  const cleanTarget = targetLang.split("-")[0] || "en";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    cleanTarget
  )}&dt=t&q=${encodeURIComponent(query2)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "*/*"
    }
  });
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = await res.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const parts = data[0].map((item) => Array.isArray(item) ? item[0] : "").filter(Boolean);
    return parts.join("");
  }
  return "";
}
async function callMyMemoryTranslate(text, targetLang) {
  const cleanTarget = targetLang.split("-")[0] || "en";
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=ja|${encodeURIComponent(cleanTarget)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RetroASMR/1.0",
      Accept: "application/json"
    }
  });
  if (res.ok) {
    const data = await res.json();
    if (data?.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
  }
  return "";
}
async function fallbackGoogleTranslate(text, targetLang) {
  if (!text || !text.trim()) return "";
  const cleanTarget = targetLang.split("-")[0] || "en";
  try {
    const gtxResult = await callGoogleTranslateGTX(text, cleanTarget);
    if (gtxResult && gtxResult.trim()) {
      return gtxResult.trim();
    }
  } catch {
  }
  try {
    const mmResult = await callMyMemoryTranslate(text, cleanTarget);
    if (mmResult && mmResult.trim() && !mmResult.includes("MYMEMORY WARNING")) {
      return mmResult.trim();
    }
  } catch {
  }
  let glossaryResult = text;
  const glossary = cleanTarget === "vi" ? ASMR_GLOSSARY_VI : ASMR_GLOSSARY_EN;
  for (const [jp, trans] of Object.entries(glossary)) {
    if (glossaryResult.includes(jp)) {
      glossaryResult = glossaryResult.replaceAll(jp, ` ${trans} `);
    }
  }
  return glossaryResult.replace(/\s+/g, " ").trim();
}
async function translateTitles(texts, targetLang = "en") {
  const cleanLang = targetLang === "vi" ? "vi" : "en";
  const result = {};
  const missingTexts = [];
  let fromCacheCount = 0;
  for (const raw of texts) {
    const trimmed = (raw || "").trim();
    if (!trimmed) continue;
    const cachedEntry = titleTranslationServerCache.get(trimmed);
    if (cachedEntry && cachedEntry[cleanLang] && cachedEntry[cleanLang] !== trimmed) {
      result[trimmed] = cachedEntry[cleanLang];
      fromCacheCount++;
    } else if (!missingTexts.includes(trimmed)) {
      missingTexts.push(trimmed);
    }
  }
  for (const text of missingTexts) {
    result[text] = text;
  }
  return {
    translations: result,
    targetLang: cleanLang,
    engine: fromCacheCount > 0 ? "server-cache" : "untranslated",
    fromCacheCount,
    newTranslatedCount: 0
  };
}
async function translateScript(text, options) {
  const targetLang = options.targetLang || "en";
  const mode = options.mode || "translated";
  const detected = detectLanguage(text);
  const isExplicitSource = options.sourceLang && options.sourceLang !== "auto" && options.sourceLang !== "Auto-detected" && options.sourceLang.toLowerCase() !== "auto";
  const sourceLang = isExplicitSource ? options.sourceLang : detected.name;
  if (!text || text.trim().length === 0) {
    return {
      translatedText: "",
      targetLang,
      sourceLang,
      detectedSourceLang: detected.name,
      mode,
      charCount: 0,
      engine: "none"
    };
  }
  const cacheKey = getScriptCacheKey(text, options);
  const cached = scriptTranslationServerCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      engine: "server-cache"
    };
  }
  const fallbackTranslated = await fallbackGoogleTranslate(text, targetLang);
  let finalResult = fallbackTranslated;
  if (mode === "bilingual") {
    const origLines = text.split("\n");
    const transLines = fallbackTranslated.split("\n");
    const combined = [];
    for (let i = 0; i < Math.max(origLines.length, transLines.length); i++) {
      const o = origLines[i] || "";
      const t = transLines[i] || "";
      if (o.trim()) combined.push(o);
      if (t.trim() && t.trim() !== o.trim()) combined.push(`  \u2192 ${t}`);
      if (!o.trim() && !t.trim()) combined.push("");
    }
    finalResult = combined.join("\n");
  }
  const resultObj = {
    translatedText: finalResult,
    targetLang,
    sourceLang,
    detectedSourceLang: detected.name,
    mode,
    charCount: finalResult.length,
    engine: "google-translate-fallback"
  };
  saveScriptToCache(cacheKey, resultObj);
  return resultObj;
}

// server.ts
var require2 = createRequire(import.meta.url);
var archiver = require2("archiver");
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var app2 = express();
var PORT = process.env.PORT || 3e3;
var isProduction = process.env.NODE_ENV === "production";
app2.use(express.json());
app2.use(express.urlencoded({ extended: true }));
app2.use(express.static(path2.join(__dirname, "public")));
var ASMR_API_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://www.asmr.one/"
};
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
function flattenTracks(items, currentPath = "") {
  let result = [];
  for (const item of items) {
    const fullPath = currentPath ? `${currentPath}/${item.title}` : item.title;
    if (item.type === "folder" && item.children) {
      result = result.concat(flattenTracks(item.children, fullPath));
    } else {
      result.push({
        hash: item.hash,
        title: item.title,
        type: item.type,
        size: item.size,
        duration: item.duration,
        mediaStreamUrl: item.mediaStreamUrl,
        mediaDownloadUrl: item.mediaDownloadUrl || item.mediaStreamUrl,
        path: fullPath
      });
    }
  }
  return result;
}
async function resolveNumericWorkId(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  try {
    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(trimmed)}?page=1`;
    const res = await fetch(searchUrl, { headers: ASMR_API_HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (data.works && data.works.length > 0) {
        const cleanInput = trimmed.toUpperCase().replace(/^0+/, "");
        const exact = data.works.find((w) => {
          const sid = String(w.source_id || "").toUpperCase().replace(/^0+/, "");
          const wid = String(w.id || "").toUpperCase();
          return sid === cleanInput || sid === "RJ" + cleanInput || wid === cleanInput;
        });
        const matched = exact || data.works[0];
        return {
          numericId: String(matched.id),
          workMeta: matched
        };
      }
    }
  } catch (err) {
    console.error("Error resolving work ID via search:", err);
  }
  const match = trimmed.match(/^(?:RJ|VJ|BJ)?0*(\d+)$/i);
  if (match && match[1]) {
    return { numericId: match[1] };
  }
  if (/^\d+$/.test(trimmed)) {
    return { numericId: trimmed };
  }
  return { numericId: trimmed };
}
function getLanguageEditions(w) {
  if (!w || !w.language_editions) return [];
  if (Array.isArray(w.language_editions)) return w.language_editions;
  if (typeof w.language_editions === "object") return Object.values(w.language_editions);
  return [];
}
function matchesTag(w, tag) {
  if (!tag) return true;
  const tagLower = tag.toLowerCase().trim();
  if (!tagLower) return true;
  if (Array.isArray(w.tags)) {
    const hasTag = w.tags.some((t) => {
      if (!t) return false;
      if (t.name && String(t.name).toLowerCase().includes(tagLower)) return true;
      if (t.id && String(t.id) === tagLower) return true;
      if (t.i18n && typeof t.i18n === "object") {
        return Object.values(t.i18n).some((val) => val?.name && String(val.name).toLowerCase().includes(tagLower));
      }
      return false;
    });
    if (hasTag) return true;
  }
  if (w.title && String(w.title).toLowerCase().includes(tagLower)) return true;
  return false;
}
function getWorkLanguageLabel(w) {
  if (!w) return { code: "ja", label: "JPN", flag: "" };
  const attrs = String(w.work_attributes || "").toUpperCase();
  const transLang = String(w.translation_info?.lang || w.language || w.lang || "").toUpperCase();
  const title = String(w.title || "");
  const tagsList = Array.isArray(w.tags) ? w.tags.map((t) => String(t.name || t.id || "")).join(" ") : "";
  if (attrs.includes("ENG") || attrs.includes("ENGLISH") || transLang.includes("ENG") || transLang === "EN" || transLang === "ENGLISH" || /【(?:English|ENG|英語|En-US)】|\[(?:English|ENG|En-US)\]|\((?:English|ENG|En-US)\)|\b(?:English|ENG|En-US|EngSub|EngDub)\b|英語音声|英語字幕|英語翻訳|English\s*Ver/i.test(title) || /English|英語|英語音声|英語字幕/i.test(tagsList)) {
    return { code: "en", label: "ENG", flag: "" };
  }
  if (attrs.includes("CHI_HANS") || transLang.includes("CHI_HANS") || transLang.includes("ZH_CN") || transLang.includes("ZH-CN") || transLang === "ZH" || /【(?:简体中文版|简体中文|简体|汉化|简中|中文)】|\[(?:简体中文|汉化|简中)\]|\((?:简体中文|汉化|简中)\)|\b(?:汉化|简体中文|中文版|简中)\b/i.test(title) || /中文|中国語|汉化|简体/i.test(tagsList)) {
    return { code: "zh-hans", label: "CHI-S", flag: "" };
  }
  if (attrs.includes("CHI_HANT") || transLang.includes("CHI_HANT") || transLang.includes("ZH_TW") || transLang.includes("ZH-TW") || /【(?:繁體中文版|繁體中文|繁体中文|繁体|繁體|繁中)】|\[(?:繁體中文|繁中)\]|\((?:繁體中文|繁中)\)|\b(?:繁體中文|繁体中文|繁體版)\b/i.test(title) || /繁體|繁体/i.test(tagsList)) {
    return { code: "zh-hant", label: "CHI-T", flag: "" };
  }
  if (attrs.includes("KO_KR") || attrs.includes("KOREAN") || transLang.includes("KO_KR") || transLang === "KO" || /【(?:한국어|한국어판|한국어버전)】|\[(?:한국어|한국어판)\]|\((?:한국어|한국어판)\)|\b한국어\b/i.test(title) || /한국어|韓国語/i.test(tagsList)) {
    return { code: "ko", label: "KOR", flag: "" };
  }
  if (attrs.includes("VIE") || attrs.includes("VIETNAMESE") || transLang.includes("VIE") || transLang === "VI" || /【(?:Tiếng Việt|Vietsub|VI)】|\[(?:Tiếng Việt|Vietsub)\]|\((?:Tiếng Việt|Vietsub)\)|\b(?:tiếng việt|vietsub|vietnamese)\b/i.test(title) || /Tiếng Việt|Vietsub|ベトナム語/i.test(tagsList)) {
    return { code: "vi", label: "VIE", flag: "" };
  }
  return { code: "ja", label: "JPN", flag: "" };
}
function matchesLanguage(w, lang) {
  if (!lang || lang === "all") return true;
  const actualLang = getWorkLanguageLabel(w).code;
  if (lang === "zh" || lang === "zh-hans") {
    return actualLang === "zh-hans";
  }
  if (lang === "zh-hant") {
    return actualLang === "zh-hant";
  }
  if (lang === "en") {
    return actualLang === "en";
  }
  if (lang === "ko") {
    return actualLang === "ko";
  }
  if (lang === "vi") {
    return actualLang === "vi";
  }
  if (lang === "ja") {
    return actualLang === "ja";
  }
  return actualLang === lang;
}
function buildUpstreamSearchQuery(query2 = "", tag = "", lang = "all") {
  const parts = [];
  const qTrim = (query2 || "").trim();
  const tagTrim = (tag || "").trim();
  if (qTrim) parts.push(qTrim);
  if (tagTrim && !parts.includes(tagTrim)) parts.push(tagTrim);
  if (lang && lang !== "all") {
    if (lang === "en") {
      parts.push("English");
    } else if (lang === "zh-hans" || lang === "zh") {
      parts.push("\u4E2D\u6587");
    } else if (lang === "zh-hant") {
      parts.push("\u7E41\u9AD4");
    } else if (lang === "ko") {
      parts.push("\uD55C\uAD6D\uC5B4");
    } else if (lang === "vi") {
      parts.push("ti\u1EBFng vi\u1EC7t");
    }
  }
  return parts.join(" ").trim();
}
var CLASSIC_POPULAR_TAGS = [
  // --- SFW: Triggers & Audio ---
  { id: "\u8033\u304B\u304D", label: "\u8033\u304B\u304D / Ear Clean [SFW]" },
  { id: "\u56C1\u304D", label: "\u56C1\u304D / Whisper [SFW]" },
  { id: "\u5410\u606F", label: "\u5410\u606F / Breathing [SFW]" },
  { id: "\u30DE\u30C3\u30B5\u30FC\u30B8", label: "\u30DE\u30C3\u30B5\u30FC\u30B8 / Massage [SFW]" },
  { id: "\u30AA\u30A4\u30EB\u30DE\u30C3\u30B5\u30FC\u30B8", label: "\u30AA\u30A4\u30EB\u30DE\u30C3\u30B5\u30FC\u30B8 / Oil Massage [SFW]" },
  { id: "\u30D8\u30C3\u30C9\u30B9\u30D1", label: "\u30D8\u30C3\u30C9\u30B9\u30D1 / Head Spa [SFW]" },
  { id: "\u30B7\u30E3\u30F3\u30D7\u30FC", label: "\u30B7\u30E3\u30F3\u30D7\u30FC / Shampoo [SFW]" },
  { id: "\u5FC3\u97F3", label: "\u5FC3\u97F3 / Heartbeat [SFW]" },
  { id: "\u30AA\u30CE\u30DE\u30C8\u30DA", label: "\u30AA\u30CE\u30DE\u30C8\u30DA / Sound FX [SFW]" },
  { id: "\u8033\u3075\u30FC", label: "\u8033\u3075\u30FC / Ear Blowing [SFW]" },
  { id: "\u30BF\u30C3\u30D4\u30F3\u30B0", label: "\u30BF\u30C3\u30D4\u30F3\u30B0 / Tapping [SFW]" },
  { id: "\u5480\u56BC\u97F3", label: "\u5480\u56BC\u97F3 / Chewing [SFW]" },
  { id: "\u6CE1\u30FB\u70AD\u9178", label: "\u6CE1\u30FB\u70AD\u9178 / Bubbles [SFW]" },
  { id: "\u96E8\u97F3", label: "\u96E8\u97F3 / Rain Sounds [SFW]" },
  { id: "\u6C34\u97F3", label: "\u6C34\u97F3 / Water Ambience [SFW]" },
  { id: "\u711A\u304D\u706B", label: "\u711A\u304D\u706B / Campfire [SFW]" },
  { id: "\u68B5\u5929", label: "\u68B5\u5929 / Fluffy Earpick [SFW]" },
  { id: "\u7DBF\u68D2", label: "\u7DBF\u68D2 / Cotton Swab [SFW]" },
  { id: "\u7AF9\u8033\u304B\u304D", label: "\u7AF9\u8033\u304B\u304D / Bamboo Earpick [SFW]" },
  { id: "\u7C98\u7740\u7DBF\u68D2", label: "\u7C98\u7740\u7DBF\u68D2 / Adhesive Swab [SFW]" },
  { id: "\u30B9\u30E9\u30A4\u30E0", label: "\u30B9\u30E9\u30A4\u30E0 / Slime [SFW]" },
  { id: "\u30D6\u30E9\u30C3\u30B7\u30F3\u30B0", label: "\u30D6\u30E9\u30C3\u30B7\u30F3\u30B0 / Hair Brushing [SFW]" },
  { id: "\u6B6F\u78E8\u304D", label: "\u6B6F\u78E8\u304D / Teeth Brushing [SFW]" },
  // --- SFW: Mood & Scenarios ---
  { id: "\u5B89\u7720", label: "\u5B89\u7720 / Sleep Aid [SFW]" },
  { id: "\u7D14\u611B", label: "\u7D14\u611B / Pure Love [SFW]" },
  { id: "\u7518\u3005", label: "\u7518\u3005 / Pampering [SFW]" },
  { id: "\u6DFB\u3044\u5BDD", label: "\u6DFB\u3044\u5BDD / Co-sleeping [SFW]" },
  { id: "\u7652\u3084\u3057", label: "\u7652\u3084\u3057 / Healing [SFW]" },
  { id: "\u304A\u98A8\u5442", label: "\u304A\u98A8\u5442 / Bath & Onsen [SFW]" },
  { id: "\u770B\u75C5", label: "\u770B\u75C5 / Caregiving [SFW]" },
  { id: "\u540C\u68F2", label: "\u540C\u68F2 / Living Together [SFW]" },
  { id: "\u544A\u767D", label: "\u544A\u767D / Confession [SFW]" },
  { id: "\u819D\u6795", label: "\u819D\u6795 / Lap Pillow [SFW]" },
  { id: "\u62B1\u64C1", label: "\u62B1\u64C1 / Hugging [SFW]" },
  { id: "\u6717\u8AAD", label: "\u6717\u8AAD / Reading [SFW]" },
  { id: "\u4F5C\u696D\u7528BGM", label: "\u4F5C\u696D\u7528BGM / Study BGM [SFW]" },
  { id: "\u30AB\u30A6\u30F3\u30BB\u30EA\u30F3\u30B0", label: "\u30AB\u30A6\u30F3\u30BB\u30EA\u30F3\u30B0 / Counseling [SFW]" },
  // --- Characters ---
  { id: "\u304A\u59C9\u3055\u3093", label: "\u304A\u59C9\u3055\u3093 / Onee-san" },
  { id: "\u59B9", label: "\u59B9 / Sister" },
  { id: "\u5E7C\u99B4\u67D3", label: "\u5E7C\u99B4\u67D3 / Friend" },
  { id: "\u5F8C\u8F29", label: "\u5F8C\u8F29 / Kouhai" },
  { id: "\u5148\u8F29", label: "\u5148\u8F29 / Senpai" },
  { id: "\u540C\u7D1A\u751F", label: "\u540C\u7D1A\u751F / Classmate" },
  { id: "\u30C4\u30F3\u30C7\u30EC", label: "\u30C4\u30F3\u30C7\u30EC / Tsundere" },
  { id: "\u30AF\u30FC\u30C7\u30EC", label: "\u30AF\u30FC\u30C7\u30EC / Kuudere" },
  { id: "\u30E4\u30F3\u30C7\u30EC", label: "\u30E4\u30F3\u30C7\u30EC / Yandere" },
  { id: "\u6BCD\u6027", label: "\u6BCD\u6027\u30FB\u30DE\u30DE / Mommy" },
  { id: "\u30E1\u30A4\u30C9", label: "\u30E1\u30A4\u30C9 / Maid" },
  { id: "\u30AE\u30E3\u30EB", label: "\u30AE\u30E3\u30EB / Gyaru" },
  { id: "\u5973\u5B50\u6821\u751F", label: "\u5973\u5B50\u6821\u751F / JK" },
  { id: "\u770B\u8B77\u5E2B", label: "\u770B\u8B77\u5E2B / Nurse" },
  { id: "\u5973\u6559\u5E2B", label: "\u5973\u6559\u5E2B / Teacher" },
  { id: "\u5973\u4E0A\u53F8", label: "\u5973\u4E0A\u53F8 / Female Boss" },
  { id: "\u304A\u5B22\u69D8", label: "\u304A\u5B22\u69D8 / Ojousama" },
  { id: "\u30B1\u30E2\u30DF\u30DF", label: "\u30B1\u30E2\u30DF\u30DF / Animal Ears" },
  { id: "\u732B\u8033", label: "\u732B\u8033 / Catgirl" },
  { id: "\u4EBA\u59BB", label: "\u4EBA\u59BB / Married Woman" },
  { id: "\u30DC\u30AF\u3063\u5A18", label: "\u30DC\u30AF\u3063\u5A18 / Tomboy" },
  { id: "VTuber", label: "VTuber / Streamer" },
  // --- Audio Tech ---
  { id: "\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB", label: "\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB / Binaural" },
  { id: "KU100", label: "KU100" },
  { id: "3Dio", label: "3Dio FreeSpace" },
  { id: "\u30C0\u30DF\u30FC\u30D8\u30C3\u30C9", label: "\u30C0\u30DF\u30FC\u30D8\u30C3\u30C9 / Dummy Head" },
  { id: "\u30CF\u30A4\u30EC\u30BE", label: "\u30CF\u30A4\u30EC\u30BE / Hi-Res" },
  { id: "\u7ACB\u4F53\u97F3\u97FF", label: "\u7ACB\u4F53\u97F3\u97FF / 3D Audio" },
  // --- NSFW (R18 / Adult) Triggers & Actions ---
  { id: "\u8033\u8210\u3081", label: "\u8033\u8210\u3081 / Ear Licking [18+]" },
  { id: "\u8033\u5965", label: "\u8033\u5965 / Deep Ear [18+]" },
  { id: "\u30AD\u30B9", label: "\u30AD\u30B9\u30FB\u30EA\u30C3\u30D7\u97F3 / Kiss [18+]" },
  { id: "\u30AA\u30CA\u30B5\u30DD\u30FC\u30C8", label: "\u30AA\u30CA\u30B5\u30DD\u30FC\u30C8 / Guided [18+]" },
  { id: "\u6DEB\u8A9E", label: "\u6DEB\u8A9E / Dirty Talk [18+]" },
  { id: "\u5598\u304E\u58F0", label: "\u5598\u304E\u58F0 / Moaning [18+]" },
  { id: "\u8A00\u8449\u8CAC\u3081", label: "\u8A00\u8449\u8CAC\u3081 / Verbal Tease [18+]" },
  { id: "\u30D5\u30A7\u30E9", label: "\u30D5\u30A7\u30E9 / Oral Sounds [18+]" },
  { id: "\u624B\u30B3\u30AD", label: "\u624B\u30B3\u30AD / Handjob [18+]" },
  { id: "\u30D1\u30A4\u30BA\u30EA", label: "\u30D1\u30A4\u30BA\u30EA / Titjob [18+]" },
  { id: "\u8DB3\u30B3\u30AD", label: "\u8DB3\u30B3\u30AD / Footjob [18+]" },
  { id: "\u7126\u3089\u3057", label: "\u7126\u3089\u3057 / Edging [18+]" },
  { id: "\u5C04\u7CBE\u7BA1\u7406", label: "\u5C04\u7CBE\u7BA1\u7406 / Orgasm Control [18+]" },
  { id: "\u643E\u7CBE", label: "\u643E\u7CBE / Milking [18+]" },
  { id: "\u4E2D\u51FA\u3057", label: "\u4E2D\u51FA\u3057 / Creampie [18+]" },
  { id: "\u751F\u30CF\u30E1", label: "\u751F\u30CF\u30E1 / Raw Sex [18+]" },
  { id: "\u5BC6\u7740", label: "\u5BC6\u7740 / Body Contact [18+]" },
  { id: "\u50AC\u7720", label: "\u50AC\u7720 / Hypnosis [18+]" },
  { id: "\u6F6E\u5439\u304D", label: "\u6F6E\u5439\u304D / Squirting [18+]" },
  { id: "\u73A9\u5177", label: "\u73A9\u5177\u30FB\u30ED\u30FC\u30BF\u30FC / Toys [18+]" },
  // --- NSFW (R18 / Adult) Tropes & Fetishes ---
  { id: "\u7518\u30B5\u30C9", label: "\u7518\u30B5\u30C9 / Sweet Sadism [18+]" },
  { id: "\u30C9S", label: "\u30C9S / Dominant [18+]" },
  { id: "\u30C9M", label: "\u30C9M / Masochist [18+]" },
  { id: "\u30E1\u30B9\u30AC\u30AD", label: "\u30E1\u30B9\u30AC\u30AD / Brat [18+]" },
  { id: "\u75F4\u5973", label: "\u75F4\u5973 / Lewd [18+]" },
  { id: "\u30B5\u30AD\u30E5\u30D0\u30B9", label: "\u30B5\u30AD\u30E5\u30D0\u30B9 / Succubus [18+]" },
  { id: "\u5DE8\u4E73", label: "\u5DE8\u4E73 / Big Breasts [18+]" },
  { id: "\u8CA7\u4E73", label: "\u8CA7\u4E73 / Flat Chest [18+]" },
  { id: "\u5C3B", label: "\u5C3B / Butt Play [18+]" },
  { id: "\u30A2\u30CA\u30EB", label: "\u30A2\u30CA\u30EB / Anal [18+]" },
  { id: "\u5BDD\u53D6\u3089\u308C", label: "\u5BDD\u53D6\u3089\u308C / NTR [18+]" },
  { id: "\u5BDD\u53D6\u308A", label: "\u5BDD\u53D6\u308A / NTS [18+]" },
  { id: "\u30CF\u30FC\u30EC\u30E0", label: "\u30CF\u30FC\u30EC\u30E0 / Harem [18+]" },
  { id: "\u90063P", label: "\u90063P / Threesome [18+]" },
  { id: "\u8FD1\u89AA\u76F8\u59E6", label: "\u8FD1\u89AA\u76F8\u59E6 / Incest [18+]" },
  { id: "\u767E\u5408", label: "\u767E\u5408 / Yuri [18+]" },
  { id: "\u4E3B\u5F93", label: "\u4E3B\u5F93 / Master & Servant [18+]" },
  { id: "\u8ABF\u6559", label: "\u8ABF\u6559 / Training [18+]" },
  { id: "\u62D8\u675F", label: "\u62D8\u675F / Bondage [18+]" },
  { id: "\u89E6\u624B", label: "\u89E6\u624B / Tentacles [18+]" },
  { id: "\u7761\u7720\u59E6", label: "\u7761\u7720\u59E6 / Sleep Sex [18+]" },
  { id: "\u9006\u30EC\u30A4\u30D7", label: "\u9006\u30EC\u30A4\u30D7 / Reverse Rape [18+]" },
  { id: "\u51E6\u5973\u55AA\u5931", label: "\u51E6\u5973\u55AA\u5931 / Virginity Loss [18+]" },
  { id: "\u7AE5\u8C9E\u5352\u696D", label: "\u7AE5\u8C9E\u5352\u696D / Male Virginity [18+]" },
  { id: "\u304A\u3082\u3089\u3057", label: "\u304A\u3082\u3089\u3057 / Omorashi [18+]" },
  { id: "\u98A8\u4FD7", label: "\u98A8\u4FD7 / Soapland [18+]" },
  { id: "\u50AC\u7720\u97F3\u58F0", label: "\u50AC\u7720\u97F3\u58F0 / Hypnotic Voice [18+]" }
];
app2.get("/api/search/:query?", async (req, res) => {
  try {
    let query2 = req.params.query || req.query.q || "";
    const page = req.query.page || "1";
    const order = req.query.order || "release";
    const sort = req.query.sort || "desc";
    const subtitle = req.query.subtitle;
    const lang = req.query.lang || "all";
    const tag = req.query.tag || "";
    const nsfw = req.query.nsfw || "all";
    const targetSearch = buildUpstreamSearchQuery(query2, tag, lang);
    let targetUrl = `https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?page=${page}&order=${order}&sort=${sort}`;
    if (subtitle !== void 0 && subtitle !== "") {
      targetUrl += `&subtitle=${subtitle}`;
    }
    let upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    let data = upstreamRes.ok ? await upstreamRes.json() : { works: [], pagination: {} };
    let works = data.works || [];
    let filtered = lang && lang !== "all" ? works.filter((w) => matchesLanguage(w, lang)) : works;
    if (tag) filtered = filtered.filter((w) => matchesTag(w, tag));
    if (filtered.length === 0 && lang && lang !== "all") {
      const altKeywords = {
        en: ["ENG", "\u82F1\u8A9E", "$ENG", "English"],
        "zh-hans": ["\u4E2D\u6587", "\u6C49\u5316", "\u7B80\u4F53", "CHI_HANS"],
        "zh-hant": ["\u7E41\u9AD4", "\u7E41\u4F53", "CHI_HANT"],
        ko: ["\uD55C\uAD6D\uC5B4", "\u97D3\u56FD\u8A9E", "KO_KR"],
        vi: ["ti\u1EBFng vi\u1EC7t", "vietsub", "vietnamese"]
      };
      const alts = altKeywords[lang] || [];
      for (const alt of alts) {
        if (alt === targetSearch) continue;
        const altQuery = query2 ? `${query2} ${alt}` : tag ? `${tag} ${alt}` : alt;
        let altUrl = `https://api.asmr.one/api/search/${encodeURIComponent(altQuery)}?page=${page}&order=${order}&sort=${sort}`;
        if (subtitle !== void 0 && subtitle !== "") altUrl += `&subtitle=${subtitle}`;
        try {
          const altRes = await fetch(altUrl, { headers: ASMR_API_HEADERS });
          if (altRes.ok) {
            const altData = await altRes.json();
            let cand = (altData.works || []).filter((w) => matchesLanguage(w, lang));
            if (tag) cand = cand.filter((w) => matchesTag(w, tag));
            if (cand.length > 0) {
              filtered = cand;
              data = altData;
              break;
            }
          }
        } catch {
        }
      }
    }
    if (nsfw === "sfw") {
      filtered = filtered.filter((w) => w.nsfw === false);
    } else if (nsfw === "nsfw") {
      filtered = filtered.filter((w) => w.nsfw === true);
    }
    data.works = filtered;
    return res.json(data);
  } catch (err) {
    console.error("Search API error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});
app2.get("/api/work/:id", async (req, res) => {
  try {
    const resolved = await resolveNumericWorkId(req.params.id);
    if (!resolved) {
      return res.status(404).json({ error: "Work not found" });
    }
    const targetUrl = `https://api.asmr.one/api/work/${resolved.numericId}`;
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Upstream error ${upstreamRes.status}` });
    }
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err) {
    console.error("Work API error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});
app2.get("/api/tracks/:id", async (req, res) => {
  try {
    const resolved = await resolveNumericWorkId(req.params.id);
    if (!resolved) {
      return res.status(404).json({ error: "Work not found" });
    }
    const targetUrl = `https://api.asmr.one/api/tracks/${resolved.numericId}`;
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Upstream error ${upstreamRes.status}` });
    }
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err) {
    console.error("Tracks API error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});
app2.get("/api/download/file", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const fileName = req.query.name || "download.bin";
    const isAttachment = req.query.inline !== "1";
    if (!targetUrl || !targetUrl.startsWith("http")) {
      return res.status(400).send("Invalid or missing URL parameter");
    }
    const requestHeaders = {
      "User-Agent": "Mozilla/5.0 (SymbianOS/9.4; Series60/5.0 Nokia5800d-1/21.0.025; Profile/MIDP-2.1 Configuration/CLDC-1.1 ) AppleWebKit/525 (KHTML, like Gecko) Version/3.0 Safari/525",
      "Referer": "https://www.asmr.one/"
    };
    if (req.headers.range) {
      requestHeaders["Range"] = req.headers.range;
    }
    const upstreamRes = await fetch(targetUrl, { headers: requestHeaders });
    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return res.status(upstreamRes.status).send(`Upstream download failed with status ${upstreamRes.status}`);
    }
    const contentType = upstreamRes.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstreamRes.headers.get("content-length");
    const contentRange = upstreamRes.headers.get("content-range");
    const acceptRanges = upstreamRes.headers.get("accept-ranges") || "bytes";
    res.status(upstreamRes.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", acceptRanges);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }
    const disposition = isAttachment ? "attachment" : "inline";
    const asciiSafe = fileName.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader("Cache-Control", "no-cache");
    if (!upstreamRes.body) {
      return res.end();
    }
    const { Readable } = await import("stream");
    const nodeStream = Readable.fromWeb(upstreamRes.body);
    nodeStream.pipe(res);
  } catch (err) {
    console.error("File download proxy error:", err);
    if (!res.headersSent) {
      res.status(500).send("File streaming proxy error");
    }
  }
});
app2.get("/api/download/playlist.m3u", async (req, res) => {
  try {
    const workId = req.query.id;
    if (!workId) return res.status(400).send("Missing work id");
    const resolved = await resolveNumericWorkId(workId);
    if (!resolved) return res.status(404).send("Work not found");
    const [tracksRes, workRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }).catch(() => null)
    ]);
    if (!tracksRes.ok) return res.status(tracksRes.status).send("Failed to fetch tracks");
    const tracksData = await tracksRes.json();
    const workData = workRes && workRes.ok ? await workRes.json() : null;
    const flattened = flattenTracks(tracksData).filter((t) => t.type === "audio" && (t.mediaStreamUrl || t.mediaDownloadUrl));
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host") || `localhost:${PORT}`;
    const baseUrl = `${protocol}://${host}`;
    let m3uContent = "#EXTM3U\n";
    m3uContent += `#PLAYLIST:${workData?.title || "ASMR Work " + resolved.numericId}

`;
    for (const track of flattened) {
      const duration = Math.round(track.duration || -1);
      const title = track.title.replace(/[\r\n]/g, "");
      const downloadProxyUrl = `${baseUrl}/api/download/file?url=${encodeURIComponent(
        track.mediaDownloadUrl || track.mediaStreamUrl || ""
      )}&name=${encodeURIComponent(track.title)}`;
      m3uContent += `#EXTINF:${duration},${title}
`;
      m3uContent += `${downloadProxyUrl}

`;
    }
    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;
    res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${rjCode}_playlist.m3u"`);
    return res.send(m3uContent);
  } catch (err) {
    console.error("M3U playlist error:", err);
    return res.status(500).send("Error generating M3U playlist");
  }
});
app2.get("/api/download/batch-links.txt", async (req, res) => {
  try {
    const workId = req.query.id;
    if (!workId) return res.status(400).send("Missing work id");
    const resolved = await resolveNumericWorkId(workId);
    if (!resolved) return res.status(404).send("Work not found");
    const tracksRes = await fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS });
    if (!tracksRes.ok) return res.status(tracksRes.status).send("Failed to fetch tracks");
    const tracksData = await tracksRes.json();
    const flattened = flattenTracks(tracksData);
    let output = `# ASMR Work ${resolved.numericId} Download Links
# Generated for Aria2, Wget, curl, IDM, Symbian

`;
    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (url) {
        output += `# [${track.type.toUpperCase()}] ${track.path} (${formatBytes(track.size)})
`;
        output += `${url}

`;
      }
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="links_${resolved.numericId}.txt"`);
    return res.send(output);
  } catch (err) {
    console.error("Batch links error:", err);
    return res.status(500).send("Error generating batch links");
  }
});
app2.get("/api/download/batch-script.sh", async (req, res) => {
  try {
    const workId = req.query.id;
    if (!workId) return res.status(400).send("Missing work id");
    const resolved = await resolveNumericWorkId(workId);
    if (!resolved) return res.status(404).send("Work not found");
    const tracksRes = await fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS });
    if (!tracksRes.ok) return res.status(tracksRes.status).send("Failed to fetch tracks");
    const tracksData = await tracksRes.json();
    const flattened = flattenTracks(tracksData);
    let script = `#!/bin/bash
# Batch downloader for ASMR Work ${resolved.numericId}
set -e

`;
    script += `TARGET_DIR="ASMR_${resolved.numericId}"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

echo "Starting download..."

`;
    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (url) {
        const safeDir = path2.dirname(track.path);
        const fileName = path2.basename(track.path);
        if (safeDir && safeDir !== ".") {
          script += `mkdir -p "${safeDir}"
`;
        }
        script += `echo "Downloading: ${track.path}"
`;
        script += `curl -C - -L -o "${track.path}" "${url}"

`;
      }
    }
    script += `echo "All downloads completed successfully!"
`;
    res.setHeader("Content-Type", "application/x-sh; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="download_${resolved.numericId}.sh"`);
    return res.send(script);
  } catch (err) {
    console.error("Batch script error:", err);
    return res.status(500).send("Error generating shell script");
  }
});
app2.get("/api/download/zip/:id", async (req, res) => {
  try {
    const resolved = await resolveNumericWorkId(req.params.id);
    if (!resolved) return res.status(404).send("Work not found");
    const [tracksRes, workRes] = await Promise.all([
      fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
      fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }).catch(() => null)
    ]);
    if (!tracksRes.ok) return res.status(tracksRes.status).send("Failed to fetch tracks");
    const tracksData = await tracksRes.json();
    const workData = workRes && workRes.ok ? await workRes.json() : null;
    const flattened = flattenTracks(tracksData).filter((t) => t.mediaDownloadUrl || t.mediaStreamUrl);
    if (flattened.length === 0) {
      return res.status(404).send("No downloadable files found in this work");
    }
    const rjCode = workData?.source_id || `RJ${resolved.numericId}`;
    const archive = archiver("zip", {
      zlib: { level: 0 }
      // Store mode for maximum speed and minimum CPU load
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(rjCode)}_archive.zip"`);
    archive.on("warning", (wErr) => {
      console.warn("Archiver warning:", wErr);
    });
    archive.on("error", (err) => {
      console.error("Archiver fatal error:", err);
      if (!res.headersSent) {
        res.status(500).send("Zip generation failed");
      }
    });
    archive.pipe(res);
    const downloadHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Referer": "https://www.asmr.one/"
    };
    const downloadLogs = [`ASMR Archive Download Log - Work ${rjCode}`];
    for (const track of flattened) {
      const url = track.mediaDownloadUrl || track.mediaStreamUrl;
      if (!url) continue;
      const cleanPath = (track.path || track.title || "file").replace(/\\/g, "/").replace(/^\/+/, "");
      try {
        const fileRes = await fetch(url, {
          headers: downloadHeaders,
          signal: AbortSignal.timeout(3e4)
          // 30s timeout per file
        });
        if (fileRes.ok) {
          const contentLength = Number(fileRes.headers.get("content-length") || 0);
          if (contentLength > 0 && contentLength < 25 * 1024 * 1024) {
            const arrayBuf = await fileRes.arrayBuffer();
            archive.append(Buffer.from(arrayBuf), { name: cleanPath });
            downloadLogs.push(`[OK] ${cleanPath} (${arrayBuf.byteLength} bytes)`);
          } else if (fileRes.body) {
            const { Readable } = await import("stream");
            const nodeStream = Readable.fromWeb(fileRes.body);
            nodeStream.on("error", (sErr) => {
              console.warn(`Stream error on file ${cleanPath}:`, sErr);
            });
            await new Promise((resolve) => {
              archive.append(nodeStream, { name: cleanPath });
              setImmediate(resolve);
            });
            downloadLogs.push(`[OK - Streamed] ${cleanPath}`);
          }
        } else {
          const errMsg = `HTTP ${fileRes.status} ${fileRes.statusText}`;
          console.warn(`Failed to fetch ${cleanPath}: ${errMsg}`);
          downloadLogs.push(`[FAILED ${errMsg}] ${cleanPath}`);
          archive.append(`Failed to download ${cleanPath}.
URL: ${url}
Error: ${errMsg}`, {
            name: `${cleanPath}.download_error.txt`
          });
        }
      } catch (fErr) {
        console.warn(`Exception downloading ${cleanPath}:`, fErr?.message || fErr);
        downloadLogs.push(`[ERROR] ${cleanPath}: ${fErr?.message || "Download exception"}`);
        archive.append(`Failed to download ${cleanPath}.
URL: ${url}
Error: ${fErr?.message || "Network exception"}`, {
          name: `${cleanPath}.download_error.txt`
        });
      }
    }
    archive.append(downloadLogs.join("\n"), { name: "_download_summary.txt" });
    await archive.finalize();
  } catch (err) {
    console.error("Zip download endpoint error:", err);
    if (!res.headersSent) {
      res.status(500).send("Zip generation failed");
    }
  }
});
app2.post("/api/translate", async (req, res) => {
  try {
    const { text, targetLang = "en", sourceLang, mode = "translated", tone = "asmr" } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text in request body" });
    }
    const result = await translateScript(text, { targetLang, sourceLang, mode, tone });
    return res.json(result);
  } catch (err) {
    console.error("Translation error:", err);
    return res.status(500).json({ error: "Translation failed", details: err.message });
  }
});
app2.get("/api/translate", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const targetLang = req.query.targetLang || req.query.lang || "en";
    const mode = req.query.mode || "translated";
    const tone = req.query.tone || "asmr";
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: "Failed to fetch script text from upstream" });
    }
    const text = await upstreamRes.text();
    const result = await translateScript(text, { targetLang, mode, tone });
    return res.json(result);
  } catch (err) {
    console.error("Translation URL error:", err);
    return res.status(500).json({ error: "Failed to translate script", details: err.message });
  }
});
app2.get("/api/download/translated-script", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const targetLang = req.query.targetLang || req.query.lang || "en";
    const mode = req.query.mode || "translated";
    const tone = req.query.tone || "asmr";
    const originalName = req.query.name || "script.txt";
    if (!targetUrl) {
      return res.status(400).send("Missing url parameter");
    }
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send("Failed to fetch script");
    }
    const text = await upstreamRes.text();
    const cacheKey = getScriptCacheKey(text, { targetLang, mode });
    const cached = getCachedScriptTranslation(cacheKey);
    let textToSend = cached ? cached.translatedText : "";
    if (!textToSend) {
      const result = await translateScript(text, { targetLang, mode, tone });
      textToSend = result.translatedText;
    }
    const safeBase = path2.basename(originalName).replace(/\.[^/.]+$/, "");
    const downloadFilename = `${safeBase}_${targetLang}_${mode}.txt`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
    return res.send(textToSend);
  } catch (err) {
    console.error("Download translation error:", err);
    return res.status(500).send("Translation download error: " + err.message);
  }
});
app2.post("/api/translate/titles", async (req, res) => {
  try {
    const { texts, targetLang = "en" } = req.body;
    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: "texts must be an array of strings" });
    }
    const cleanLang = targetLang === "vi" ? "vi" : "en";
    const result = await translateTitles(texts, cleanLang);
    return res.json(result);
  } catch (err) {
    console.error("Batch title translation error:", err);
    return res.status(500).json({ error: "Failed to translate titles", details: err.message });
  }
});
app2.get("/api/translate/titles", async (req, res) => {
  try {
    const text = req.query.text || "";
    const targetLang = req.query.targetLang === "vi" ? "vi" : "en";
    if (!text.trim()) {
      return res.status(400).json({ error: "Missing text parameter" });
    }
    const result = await translateTitles([text], targetLang);
    return res.json(result);
  } catch (err) {
    console.error("Single title translation error:", err);
    return res.status(500).json({ error: "Failed to translate title", details: err.message });
  }
});
app2.post("/api/translate/cache-upload", (req, res) => {
  try {
    if (req.body && typeof req.body === "object") {
      const sensitiveKeys = ["apiKey", "api_key", "key", "geminiKey", "gemini_api_key", "token"];
      for (const k of sensitiveKeys) {
        if (req.body[k]) {
          delete req.body[k];
          console.warn(`[Security Audit] Stripped unexpected field "${k}" from /api/translate/cache-upload. Translation API keys must remain strictly client-side.`);
        }
      }
    }
    const { translations, targetLang = "en", workInfo } = req.body;
    if (!translations || typeof translations !== "object") {
      return res.status(400).json({ error: "translations must be an object" });
    }
    const cleanLang = targetLang === "vi" ? "vi" : "en";
    const result = uploadTitleTranslations(translations, cleanLang, workInfo);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("Cache upload error:", err);
    return res.status(500).json({ error: "Failed to upload cache", details: err.message });
  }
});
app2.post("/api/translate/cached-titles", (req, res) => {
  try {
    const { texts, targetLang = "en" } = req.body;
    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: "texts must be an array of strings" });
    }
    const cleanLang = targetLang === "vi" ? "vi" : "en";
    const result = getCachedTitlesBatch(texts, cleanLang);
    return res.json(result);
  } catch (err) {
    console.error("Cache query error:", err);
    return res.status(500).json({ error: "Failed to query cache", details: err.message });
  }
});
app2.post("/api/translate/check-work", (req, res) => {
  try {
    const { workIdOrRj = "", originalTitle = "", trackTitles = [], targetLang = "en" } = req.body;
    const cleanLang = targetLang === "vi" ? "vi" : "en";
    const tracks = Array.isArray(trackTitles) ? trackTitles : [];
    const status = checkWorkTranslationStatus(workIdOrRj, originalTitle, tracks, cleanLang);
    return res.json(status);
  } catch (err) {
    console.error("Work translation check error:", err);
    return res.status(500).json({ error: "Failed to check work translation status", details: err.message });
  }
});
app2.get("/api/translate/works", (req, res) => {
  try {
    const lang = req.query.lang || "all";
    const q = req.query.q || "";
    const cleanLang = lang === "en" || lang === "vi" ? lang : "all";
    const works = getPermanentTranslatedWorks(cleanLang, q);
    const stats = getPermanentTranslationStats();
    return res.json({ works, total: works.length, stats });
  } catch (err) {
    console.error("Failed to retrieve permanent translated works:", err);
    return res.status(500).json({ error: "Failed to retrieve translated works", details: err.message });
  }
});
app2.get("/api/translate/works/:id", (req, res) => {
  try {
    const work = getPermanentTranslatedWork(req.params.id);
    if (!work) {
      return res.status(404).json({ error: "Translated work not found in permanent vault" });
    }
    return res.json(work);
  } catch (err) {
    console.error("Failed to retrieve translated work by id:", err);
    return res.status(500).json({ error: "Failed to retrieve translated work", details: err.message });
  }
});
app2.get("/api/translate/cache-stats", (_req, res) => {
  return res.json(getServerTranslationCacheStats());
});
app2.get("/api/translate/vault-stats", (_req, res) => {
  return res.json(getPermanentTranslationStats());
});
app2.post("/api/translate/script-cache", (req, res) => {
  try {
    const { hash = "", text = "", targetLang = "en", mode = "translated" } = req.body;
    const cacheKey = getScriptCacheKey(hash || text, { targetLang, mode });
    const cached = getCachedScriptTranslation(cacheKey);
    if (cached) {
      return res.json({ cached: true, cacheKey, ...cached });
    }
    return res.json({ cached: false, cacheKey });
  } catch (err) {
    console.error("Script cache check error:", err);
    return res.status(500).json({ error: "Failed to check script cache", details: err.message });
  }
});
app2.post("/api/translate/script-upload", (req, res) => {
  try {
    if (req.body && typeof req.body === "object") {
      const sensitiveKeys = ["apiKey", "api_key", "key", "geminiKey", "gemini_api_key", "token"];
      for (const k of sensitiveKeys) {
        if (req.body[k]) {
          delete req.body[k];
          console.warn(`[Security Audit] Stripped unexpected field "${k}" from /api/translate/script-upload. Translation API keys must remain strictly client-side.`);
        }
      }
    }
    const { cacheKey, hash, text, targetLang = "en", mode = "translated", translatedText, sourceLang, workId } = req.body;
    if (!translatedText || typeof translatedText !== "string") {
      return res.status(400).json({ error: "translatedText must be a non-empty string" });
    }
    const result = uploadScriptTranslation({
      cacheKey,
      hash,
      rawText: text,
      targetLang,
      mode,
      translatedText,
      sourceLang,
      workId
    });
    return res.json(result);
  } catch (err) {
    console.error("Script upload error:", err);
    return res.status(500).json({ error: "Failed to upload script translation", details: err.message });
  }
});
function escapeHtml(str = "") {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function getRetroCss() {
  return `
    body {
      background-color: #f0f2f5;
      color: #111827;
      font-family: Tahoma, Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      margin: 0;
      padding: 6px;
    }
    .wrapper {
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #c5cbd5;
    }
    .header {
      background: #cc0000; /* Opera Red */
      color: #ffffff;
      padding: 8px 10px;
      font-size: 14px;
      font-weight: bold;
    }
    .header a {
      color: #ffffff;
      text-decoration: none;
    }
    .subnav {
      background: #e4e7eb;
      border-bottom: 1px solid #c5cbd5;
      padding: 6px 10px;
      font-size: 11px;
    }
    .subnav a {
      color: #0b57d0;
      text-decoration: underline;
      margin-right: 8px;
    }
    .content {
      padding: 8px 10px;
    }
    .search-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px;
      margin-bottom: 10px;
    }
    input[type="text"] {
      width: 80%;
      max-width: 280px;
      padding: 4px;
      border: 1px solid #94a3b8;
      font-size: 12px;
      font-family: inherit;
    }
    input[type="submit"], .btn {
      background: #0284c7;
      color: #ffffff;
      border: 1px solid #0369a1;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: bold;
      text-decoration: none;
      cursor: pointer;
      display: inline-block;
    }
    .btn-green {
      background: #16a34a;
      border-color: #15803d;
    }
    .btn-amber {
      background: #d97706;
      border-color: #b45309;
    }
    .btn-red {
      background: #dc2626;
      border-color: #b91c1c;
    }
    .btn-sm {
      font-size: 11px;
      padding: 2px 5px;
    }
    .work-item {
      border-bottom: 1px dotted #cbd5e1;
      padding: 8px 0;
    }
    .work-title {
      font-size: 13px;
      font-weight: bold;
      color: #0f172a;
      margin-bottom: 3px;
    }
    .work-title a {
      color: #0284c7;
      text-decoration: none;
    }
    .work-title a:hover {
      text-decoration: underline;
    }
    .meta-tag {
      font-size: 11px;
      color: #475569;
    }
    .badge {
      display: inline-block;
      background: #e2e8f0;
      color: #334155;
      padding: 1px 4px;
      font-size: 10px;
      margin-right: 4px;
      border-radius: 2px;
    }
    .badge-rj {
      background: #fee2e2;
      color: #b91c1c;
      font-weight: bold;
    }
    .badge-rating {
      background: #fef3c7;
      color: #92400e;
      font-weight: bold;
    }
    .track-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .track-table th {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      text-align: left;
      font-size: 11px;
    }
    .track-table td {
      border: 1px solid #e2e8f0;
      padding: 4px 6px;
      font-size: 11px;
    }
    .folder-row {
      background: #f8fafc;
      font-weight: bold;
      color: #334155;
    }
    .footer {
      background: #f1f5f9;
      border-top: 1px solid #cbd5e1;
      padding: 8px 10px;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
    .footer a {
      color: #0284c7;
    }
    .pagination {
      margin: 10px 0;
      padding: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      text-align: center;
      font-size: 12px;
    }
    .pagination a {
      color: #0284c7;
      margin: 0 6px;
      text-decoration: underline;
      font-weight: bold;
    }
    .info-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 6px 8px;
      margin: 6px 0;
      font-size: 11px;
      color: #1e3a8a;
    }
    .device-indicator {
      float: right;
      font-size: 10px;
      background: #b91c1c;
      color: #ffffff;
      padding: 1px 4px;
    }
  `;
}
function renderRetroPage(title, bodyContent, activeQuery = "", imgMode = "1", langMode = "all", tagMode = "") {
  return `<!DOCTYPE html PUBLIC "-//WAPFORUM//DTD XHTML Mobile 1.0//EN" "http://www.wapforum.org/DTD/xhtml-mobile10.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0" />
  <title>${escapeHtml(title)} - RetroASMR</title>
  <style type="text/css">
    ${getRetroCss()}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <a href="/?img=${imgMode}&lang=${langMode}">RetroASMR</a>
    </div>
    <div class="subnav">
      <a href="/?img=${imgMode}&lang=${langMode}">[Home]</a>
      <a href="/translated?img=${imgMode}&lang=${langMode}" style="color:#b91c1c; font-weight:bold;">[\u2605 Translated Vault]</a>
      <a href="/search?tag=\u8033\u304B\u304D&img=${imgMode}&lang=${langMode}">[Ear Clean]</a>
      <a href="/search?tag=\u56C1\u304D&img=${imgMode}&lang=${langMode}">[Whisper]</a>
      <a href="/search?tag=\u30DE\u30C3\u30B5\u30FC\u30B8&img=${imgMode}&lang=${langMode}">[Massage]</a>
      <a href="/search?tag=\u5B89\u7720&img=${imgMode}&lang=${langMode}">[Sleep]</a>
      <a href="/search?tag=\u7D14\u611B&img=${imgMode}&lang=${langMode}">[Pure Love]</a>
      <a href="/search?tag=\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB&img=${imgMode}&lang=${langMode}">[Binaural]</a>
      ${tagMode ? `| Tag: <strong style="color:#b91c1c;">#${escapeHtml(tagMode)}</strong> <a href="/search?q=${encodeURIComponent(activeQuery)}&img=${imgMode}&lang=${langMode}">[Clear]</a>` : ""}
      | Img:
      ${imgMode === "0" ? "<strong>No Img</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=0&lang=${langMode}">[No Img]</a>`}
      ${imgMode === "1" ? "<strong>240px</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=1&lang=${langMode}">[240px]</a>`}
      | Lang:
      ${langMode === "all" ? "<strong>All</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=all">[All]</a>`}
      ${langMode === "ja" ? "<strong>JP</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=ja">[JP]</a>`}
      ${langMode === "zh-hans" ? "<strong>CHI-S</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=zh-hans">[CHI-S]</a>`}
      ${langMode === "zh-hant" ? "<strong>CHI-T</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=zh-hant">[CHI-T]</a>`}
      ${langMode === "en" ? "<strong>EN</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=en">[EN]</a>`}
      ${langMode === "vi" ? "<strong>VI</strong>" : `<a href="?q=${encodeURIComponent(activeQuery)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=vi">[VI]</a>`}
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      <a href="/?img=${imgMode}&lang=${langMode}">RetroASMR</a> &bull; <a href="/?img=${imgMode}&lang=${langMode}">Back to Top</a>
    </div>
  </div>
</body>
</html>`;
}
async function handleHomeRequest(req, res) {
  const imgMode = req.query.img || "1";
  const langMode = req.query.lang || "all";
  const tagMode = req.query.tag || "";
  const order = req.query.order || "release";
  const sort = req.query.sort || "desc";
  let popularHtml = "";
  try {
    const targetSearch = buildUpstreamSearchQuery("", tagMode, langMode);
    let popRes = await fetch(`https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?order=${order}&sort=${sort}&page=1`, {
      headers: ASMR_API_HEADERS
    });
    let works = [];
    if (popRes.ok) {
      const data = await popRes.json();
      works = data.works || [];
    }
    let filtered = langMode !== "all" ? works.filter((w) => matchesLanguage(w, langMode)) : works;
    if (tagMode) filtered = filtered.filter((w) => matchesTag(w, tagMode));
    if (filtered.length === 0 && langMode !== "all") {
      const altKeywords = {
        en: ["ENG", "\u82F1\u8A9E", "$ENG", "English"],
        "zh-hans": ["\u4E2D\u6587", "\u6C49\u5316", "\u7B80\u4F53", "CHI_HANS"],
        "zh-hant": ["\u7E41\u9AD4", "\u7E41\u4F53", "CHI_HANT"],
        ko: ["\uD55C\uAD6D\uC5B4", "\u97D3\u56FD\u8A9E", "KO_KR"],
        vi: ["ti\u1EBFng vi\u1EC7t", "vietsub", "vietnamese"]
      };
      const alts = altKeywords[langMode] || [];
      for (const alt of alts) {
        if (alt === targetSearch) continue;
        const altQuery = tagMode ? `${tagMode} ${alt}` : alt;
        try {
          const altRes = await fetch(`https://api.asmr.one/api/search/${encodeURIComponent(altQuery)}?order=${order}&sort=${sort}&page=1`, {
            headers: ASMR_API_HEADERS
          });
          if (altRes.ok) {
            const altData = await altRes.json();
            let cand = (altData.works || []).filter((w) => matchesLanguage(w, langMode));
            if (tagMode) cand = cand.filter((w) => matchesTag(w, tagMode));
            if (cand.length > 0) {
              filtered = cand;
              break;
            }
          }
        } catch {
        }
      }
    }
    works = filtered.slice(0, 12);
    const sortTitle = order === "release" ? "Recent Releases" : order === "dl_count" ? "Top Downloaded" : order === "rating" ? "Highest Rated" : "Recently Added";
    popularHtml = `<h3>${sortTitle} ${tagMode ? `(#${escapeHtml(tagMode)})` : ""} (${langMode.toUpperCase()})</h3>`;
    if (works.length === 0) {
      popularHtml += "<p>No matching works found for this filter.</p>";
    }
    for (const w of works) {
      const coverHtml = imgMode !== "0" && w.thumbnailCoverUrl ? `<div style="margin: 4px 0;"><img src="${escapeHtml(
        w.thumbnailCoverUrl
      )}" width="120" height="120" alt="Cover" style="border:1px solid #ccc;" /></div>` : "";
      const vaNames = (w.vas || []).map((v) => v.name).join(", ") || "N/A";
      const langInfo = getWorkLanguageLabel(w);
      let editionsHtml = "";
      const edList = getLanguageEditions(w);
      if (edList.length > 0) {
        editionsHtml = `<div style="font-size:10px; margin-top:2px; color:#475569;">
          Editions: ${edList.map((ed) => `<a href="/work/${encodeURIComponent(ed.workno)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(" ")}
        </div>`;
      }
      const tagsHtml = w.tags && w.tags.length > 0 ? `<div class="meta-tag" style="margin-top:2px;">Tags: ${w.tags.slice(0, 5).map((t) => `<a href="/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}&order=${order}" style="color:#0284c7; text-decoration:underline; margin-right:3px;">[#${escapeHtml(t.name)}]</a>`).join(" ")}</div>` : "";
      popularHtml += `
        <div class="work-item">
          <span class="badge badge-rj">${escapeHtml(w.source_id || "RJ" + w.id)}</span>
          <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.label)}</span>
          <span class="badge badge-rating">Rating: ${escapeHtml(String(w.rate_average_2dp || "0"))}</span>
          <div class="work-title">
            <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">${escapeHtml(w.title)}</a>
          </div>
          ${coverHtml}
          <div class="meta-tag">
            Circle: <strong>${escapeHtml(w.name || "N/A")}</strong> | CV: ${escapeHtml(vaNames)}<br />
            DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || "N/A")}
          </div>
          ${tagsHtml}
          ${editionsHtml}
          <div style="margin-top: 4px;">
            <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}" class="btn btn-sm">[View Tracks]</a>
            <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[M3U Playlist]</a>
          </div>
        </div>
      `;
    }
  } catch (err) {
    popularHtml = '<p style="color:red;">Could not load works list.</p>';
  }
  const allPopularTags = [...CLASSIC_POPULAR_TAGS];
  if (tagMode && !allPopularTags.some((t) => t.id === tagMode || t.id.toLowerCase() === tagMode.toLowerCase())) {
    allPopularTags.unshift({ id: tagMode, label: `#${tagMode}` });
  }
  const tagSelectOptions = allPopularTags.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${tagMode === t.id ? "selected" : ""}>${escapeHtml(t.label)}</option>`
  ).join("");
  const content = `
    <div style="font-size:11px; margin-bottom:6px; background:#f1f5f9; padding:5px 8px; border:1px solid #cbd5e1;">
      <strong>Sort:</strong> 
      ${order === "release" ? '<strong style="color:#b91c1c;">[Recent]</strong>' : `<a href="/?order=release&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Recent]</a>`} |
      ${order === "dl_count" ? '<strong style="color:#b91c1c;">[Top DLs]</strong>' : `<a href="/?order=dl_count&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Top DLs]</a>`} |
      ${order === "rating" ? '<strong style="color:#b91c1c;">[Top Rated]</strong>' : `<a href="/?order=rating&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Top Rated]</a>`} |
      ${order === "create_date" ? '<strong style="color:#b91c1c;">[New Added]</strong>' : `<a href="/?order=create_date&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[New Added]</a>`}
    </div>

    <div class="search-box">
      <form action="/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" id="q" name="q" placeholder="RJ code or keyword" value="" style="margin-bottom:4px;" /><br />
        
        <label for="order"><strong>Sort:</strong></label>
        <select name="order" id="order" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="release" ${order === "release" ? "selected" : ""}>Recent</option>
          <option value="dl_count" ${order === "dl_count" ? "selected" : ""}>Top Downloads</option>
          <option value="rating" ${order === "rating" ? "selected" : ""}>Rating</option>
          <option value="create_date" ${order === "create_date" ? "selected" : ""}>New Added</option>
          <option value="review_count" ${order === "review_count" ? "selected" : ""}>Reviews</option>
        </select>

        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === "all" ? "selected" : ""}>All Languages</option>
          <option value="ja" ${langMode === "ja" ? "selected" : ""}>Japanese (JP)</option>
          <option value="zh-hans" ${langMode === "zh-hans" ? "selected" : ""}>Simplified Chinese (CHI-S)</option>
          <option value="zh-hant" ${langMode === "zh-hant" ? "selected" : ""}>Traditional Chinese (CHI-T)</option>
          <option value="en" ${langMode === "en" ? "selected" : ""}>English (ENG)</option>
          <option value="vi" ${langMode === "vi" ? "selected" : ""}>Vietnamese (VIE)</option>
          <option value="ko" ${langMode === "ko" ? "selected" : ""}>Korean (KOR)</option>
        </select>

        <label for="tag"><strong>Tag:</strong></label>
        <select name="tag" id="tag" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="">All Tags</option>
          ${tagSelectOptions}
        </select>
        <input type="submit" value="Search" />
      </form>
      <div style="font-size:11px; margin-top:5px; color:#475569;">
        Quick: 
        <a href="/search?tag=\u8033\u304B\u304D&img=${imgMode}&lang=${langMode}&order=${order}">[\u8033\u304B\u304D]</a>
        <a href="/search?tag=\u56C1\u304D&img=${imgMode}&lang=${langMode}&order=${order}">[\u56C1\u304D]</a>
        <a href="/search?tag=\u8033\u8210\u3081&img=${imgMode}&lang=${langMode}&order=${order}">[\u8033\u8210\u3081(18+)]</a>
        <a href="/search?tag=\u30AA\u30CA\u30B5\u30DD\u30FC\u30C8&img=${imgMode}&lang=${langMode}&order=${order}">[\u30AA\u30CA\u30B5\u30DD(18+)]</a>
        <a href="/search?tag=\u5B89\u7720&img=${imgMode}&lang=${langMode}&order=${order}">[\u5B89\u7720]</a>
        <a href="/search?tag=\u7D14\u611B&img=${imgMode}&lang=${langMode}&order=${order}">[\u7D14\u611B]</a>
        <a href="/search?tag=\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB&img=${imgMode}&lang=${langMode}&order=${order}">[\u30D0\u30A4\u30CE\u30FC\u30E9\u30EB]</a>
      </div>
    </div>

    ${popularHtml}
  `;
  return res.send(renderRetroPage("Home", content, "", imgMode, langMode, tagMode));
}
async function handleSearchRequest(req, res) {
  let query2 = req.query.q || "";
  const page = parseInt(req.query.page || "1", 10) || 1;
  const imgMode = req.query.img || "1";
  const langMode = req.query.lang || "all";
  const tagMode = req.query.tag || "";
  const order = req.query.order || "release";
  const sort = req.query.sort || "desc";
  let resultsHtml = "";
  let paginationHtml = "";
  try {
    const targetSearch = buildUpstreamSearchQuery(query2, tagMode, langMode);
    const searchUrl = `https://api.asmr.one/api/search/${encodeURIComponent(targetSearch)}?page=${page}&order=${order}&sort=${sort}`;
    let upstreamRes = await fetch(searchUrl, { headers: ASMR_API_HEADERS });
    let works = [];
    let total = 0;
    let pageSize = 20;
    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      works = data.works || [];
      total = data.pagination?.totalCount || 0;
      pageSize = data.pagination?.pageSize || 20;
    }
    let filtered = langMode !== "all" ? works.filter((w) => matchesLanguage(w, langMode)) : works;
    if (tagMode) filtered = filtered.filter((w) => matchesTag(w, tagMode));
    if (filtered.length === 0 && langMode !== "all") {
      const altKeywords = {
        en: ["ENG", "\u82F1\u8A9E", "$ENG", "English"],
        "zh-hans": ["\u4E2D\u6587", "\u6C49\u5316", "\u7B80\u4F53", "CHI_HANS"],
        "zh-hant": ["\u7E41\u9AD4", "\u7E41\u4F53", "CHI_HANT"],
        ko: ["\uD55C\uAD6D\uC5B4", "\u97D3\u56FD\u8A9E", "KO_KR"],
        vi: ["ti\u1EBFng vi\u1EC7t", "vietsub", "vietnamese"]
      };
      const alts = altKeywords[langMode] || [];
      for (const alt of alts) {
        if (alt === targetSearch) continue;
        const altQuery = query2 ? `${query2} ${alt}` : tagMode ? `${tagMode} ${alt}` : alt;
        const altUrl = `https://api.asmr.one/api/search/${encodeURIComponent(altQuery)}?page=${page}&order=${order}&sort=${sort}`;
        try {
          const altRes = await fetch(altUrl, { headers: ASMR_API_HEADERS });
          if (altRes.ok) {
            const altData = await altRes.json();
            let cand = (altData.works || []).filter((w) => matchesLanguage(w, langMode));
            if (tagMode) cand = cand.filter((w) => matchesTag(w, tagMode));
            if (cand.length > 0) {
              filtered = cand;
              total = altData.pagination?.totalCount || cand.length;
              break;
            }
          }
        } catch {
        }
      }
    }
    works = filtered;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const orderLabel = order === "release" ? "Recent" : order === "dl_count" ? "Top Downloads" : order === "rating" ? "Rating" : "New Added";
    resultsHtml += `
      <div style="font-size:11px; margin-bottom:8px; padding:4px 6px; background:#f1f5f9; border:1px solid #cbd5e1;">
        <strong>Sort:</strong> 
        ${order === "release" ? '<strong style="color:#b91c1c;">[Recent]</strong>' : `<a href="/search?q=${encodeURIComponent(query2)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=release">[Recent]</a>`} |
        ${order === "dl_count" ? '<strong style="color:#b91c1c;">[Top DLs]</strong>' : `<a href="/search?q=${encodeURIComponent(query2)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=dl_count">[Top DLs]</a>`} |
        ${order === "rating" ? '<strong style="color:#b91c1c;">[Top Rated]</strong>' : `<a href="/search?q=${encodeURIComponent(query2)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=rating">[Top Rated]</a>`} |
        ${order === "create_date" ? '<strong style="color:#b91c1c;">[New Added]</strong>' : `<a href="/search?q=${encodeURIComponent(query2)}&tag=${encodeURIComponent(tagMode)}&img=${imgMode}&lang=${langMode}&order=create_date">[New Added]</a>`}
      </div>

      <div style="font-size:12px; margin-bottom: 8px;">
        Results: <strong>${works.length}</strong> works (Sorted by: <strong>${orderLabel}</strong> &bull; Page ${page} of ${totalPages} &bull; Lang: ${escapeHtml(langMode.toUpperCase())})
        ${tagMode ? ` &bull; Tag: <strong style="color:#b91c1c;">#${escapeHtml(tagMode)}</strong> <a href="/search?q=${encodeURIComponent(query2)}&img=${imgMode}&lang=${langMode}&order=${order}">[Clear]</a>` : ""}
      </div>
    `;
    if (works.length === 0) {
      resultsHtml += "<p>No matching works found.</p>";
    } else {
      for (const w of works) {
        const coverHtml = imgMode !== "0" && w.thumbnailCoverUrl ? `<div style="margin: 4px 0;"><img src="${escapeHtml(
          w.thumbnailCoverUrl
        )}" width="120" height="120" alt="Cover" style="border:1px solid #ccc;" /></div>` : "";
        const vaNames = (w.vas || []).map((v) => v.name).join(", ") || "N/A";
        const langInfo = getWorkLanguageLabel(w);
        let editionsHtml = "";
        const edList = getLanguageEditions(w);
        if (edList.length > 0) {
          editionsHtml = `<div style="font-size:10px; margin-top:2px; color:#475569;">
            Editions: ${edList.map((ed) => `<a href="/work/${encodeURIComponent(ed.workno)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`).join(" ")}
          </div>`;
        }
        const tagsHtml = w.tags && w.tags.length > 0 ? `<div class="meta-tag" style="margin-top:2px;">Tags: ${w.tags.slice(0, 5).map((t) => `<a href="/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}&order=${order}" style="color:#0284c7; text-decoration:underline; margin-right:3px;">[#${escapeHtml(t.name)}]</a>`).join(" ")}</div>` : "";
        resultsHtml += `
          <div class="work-item">
            <span class="badge badge-rj">${escapeHtml(w.source_id || "RJ" + w.id)}</span>
            <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.label)}</span>
            <span class="badge badge-rating">Rating: ${escapeHtml(String(w.rate_average_2dp || "0"))}</span>
            <div class="work-title">
              <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">${escapeHtml(w.title)}</a>
            </div>
            ${coverHtml}
            <div class="meta-tag">
              Circle: <strong>${escapeHtml(w.name || "N/A")}</strong> | CV: ${escapeHtml(vaNames)}<br />
              DLs: ${escapeHtml(String(w.dl_count || 0))} | Released: ${escapeHtml(w.release || "N/A")}
            </div>
            ${tagsHtml}
            ${editionsHtml}
            <div style="margin-top: 5px;">
              <a href="/work/${encodeURIComponent(w.source_id || w.id)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}" class="btn btn-sm">[View Tracks]</a>
              <a href="/api/download/playlist.m3u?id=${w.id}" class="btn btn-green btn-sm">[M3U Playlist]</a>
            </div>
          </div>
        `;
      }
      paginationHtml = '<div class="pagination">';
      if (page > 1) {
        paginationHtml += `<a href="/search?q=${encodeURIComponent(query2)}&tag=${encodeURIComponent(tagMode)}&page=${page - 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">&laquo; Previous Page</a> | `;
      }
      paginationHtml += `Page ${page} / ${totalPages}`;
      if (page < totalPages) {
        paginationHtml += ` | <a href="/search?q=${encodeURIComponent(query2)}&tag=${encodeURIComponent(tagMode)}&page=${page + 1}&img=${imgMode}&lang=${langMode}&order=${order}&sort=${sort}">Next Page &raquo;</a>`;
      }
      paginationHtml += "</div>";
    }
  } catch (err) {
    resultsHtml = `<p style="color:red;">Error connecting to ASMR search service: ${escapeHtml(err.message)}</p>`;
  }
  const allSearchTags = [...CLASSIC_POPULAR_TAGS];
  if (tagMode && !allSearchTags.some((t) => t.id === tagMode || t.id.toLowerCase() === tagMode.toLowerCase())) {
    allSearchTags.unshift({ id: tagMode, label: `#${tagMode}` });
  }
  const tagSelectOptions = allSearchTags.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${tagMode === t.id ? "selected" : ""}>${escapeHtml(t.label)}</option>`
  ).join("");
  const content = `
    <div class="search-box">
      <form action="/search" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" name="q" value="${escapeHtml(query2)}" placeholder="RJ code or keywords..." style="margin-bottom:4px;" /><br />
        
        <label for="order"><strong>Sort:</strong></label>
        <select name="order" id="order" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="release" ${order === "release" ? "selected" : ""}>Recent</option>
          <option value="dl_count" ${order === "dl_count" ? "selected" : ""}>Top Downloads</option>
          <option value="rating" ${order === "rating" ? "selected" : ""}>Rating</option>
          <option value="create_date" ${order === "create_date" ? "selected" : ""}>New Added</option>
          <option value="review_count" ${order === "review_count" ? "selected" : ""}>Reviews</option>
        </select>

        <label for="lang"><strong>Lang:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${langMode === "all" ? "selected" : ""}>All Languages</option>
          <option value="ja" ${langMode === "ja" ? "selected" : ""}>Japanese (JP)</option>
          <option value="zh-hans" ${langMode === "zh-hans" ? "selected" : ""}>Simplified Chinese (CHI-S)</option>
          <option value="zh-hant" ${langMode === "zh-hant" ? "selected" : ""}>Traditional Chinese (CHI-T)</option>
          <option value="en" ${langMode === "en" ? "selected" : ""}>English (ENG)</option>
          <option value="vi" ${langMode === "vi" ? "selected" : ""}>Vietnamese (VIE)</option>
          <option value="ko" ${langMode === "ko" ? "selected" : ""}>Korean (KOR)</option>
        </select>

        <label for="tag"><strong>Tag:</strong></label>
        <select name="tag" id="tag" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="">All Tags</option>
          ${tagSelectOptions}
        </select>
        <input type="submit" value="Search" />
      </form>
    </div>
    ${resultsHtml}
    ${paginationHtml}
  `;
  return res.send(renderRetroPage(`Search: ${query2 || tagMode || (langMode !== "all" ? langMode.toUpperCase() : "Popular")}`, content, query2, imgMode, langMode, tagMode));
}
async function handleWorkRequest(req, res) {
  const inputId = req.params.id;
  const imgMode = req.query.img || "1";
  const transMode = req.query.trans || "";
  const tagMode = req.query.tag || "";
  const langMode = req.query.lang || "all";
  try {
    let resolved = await resolveNumericWorkId(inputId);
    let workRes = null;
    let tracksRes = null;
    if (resolved) {
      const [wR, tR] = await Promise.all([
        fetch(`https://api.asmr.one/api/work/${resolved.numericId}`, { headers: ASMR_API_HEADERS }),
        fetch(`https://api.asmr.one/api/tracks/${resolved.numericId}`, { headers: ASMR_API_HEADERS })
      ]);
      workRes = wR;
      tracksRes = tR;
    }
    if (!tracksRes || !tracksRes.ok) {
      const cleanDigits = inputId.replace(/[^0-9]/g, "");
      const candidates = [inputId];
      if (cleanDigits) {
        candidates.push(`RJ${cleanDigits}`);
        candidates.push(cleanDigits);
        candidates.push(cleanDigits.replace(/^0+/, ""));
        candidates.push(`0${cleanDigits}`);
      }
      for (const cand of candidates) {
        if (resolved && cand === resolved.numericId) continue;
        try {
          const [wR, tR] = await Promise.all([
            fetch(`https://api.asmr.one/api/work/${encodeURIComponent(cand)}`, { headers: ASMR_API_HEADERS }),
            fetch(`https://api.asmr.one/api/tracks/${encodeURIComponent(cand)}`, { headers: ASMR_API_HEADERS })
          ]);
          if (tR.ok) {
            workRes = wR;
            tracksRes = tR;
            resolved = { numericId: cand, workMeta: wR.ok ? await wR.json().catch(() => null) : null };
            break;
          }
        } catch {
        }
      }
    }
    const workData = workRes && workRes.ok ? await workRes.json() : resolved?.workMeta || null;
    let flattened = [];
    if (tracksRes && tracksRes.ok) {
      const tracksData = await tracksRes.json();
      flattened = flattenTracks(tracksData);
    }
    if (!workData && flattened.length === 0) {
      return res.status(404).send(renderRetroPage("Not Found", `<p style="color:red;">Work ${escapeHtml(inputId)} not found on server.</p><p><a href="/search?q=${encodeURIComponent(inputId)}">&laquo; Search for ${escapeHtml(inputId)}</a></p>`, "", imgMode));
    }
    const audioTracks = flattened.filter((t) => t.type === "audio");
    const textTracks = flattened.filter((t) => t.type === "text");
    const totalSize = flattened.reduce((acc, t) => acc + (t.size || 0), 0);
    const actualId = resolved?.numericId || inputId;
    const rjCode = workData?.source_id || (inputId.toUpperCase().startsWith("RJ") ? inputId : `RJ${actualId}`);
    const rawTitle = (workData?.title || `Work ${actualId}`).trim();
    let displayTitle = rawTitle;
    let trackTranslations = {};
    let isFullyCached = false;
    let missingCount = 0;
    const textsToTranslate = [rawTitle, ...flattened.map((t) => (t.title || "").trim())].filter(Boolean);
    if (transMode === "en" || transMode === "vi") {
      try {
        const cacheCheck = getCachedTitlesBatch(textsToTranslate, transMode);
        trackTranslations = cacheCheck.cached;
        displayTitle = trackTranslations[rawTitle] || rawTitle;
        isFullyCached = cacheCheck.missing.length === 0;
        missingCount = cacheCheck.missing.length;
      } catch (tErr) {
        console.warn("SSR title cache query error:", tErr);
      }
    }
    const circleName = workData?.name || "N/A";
    const vas = (workData?.vas || []).map((v) => v.name).join(", ") || "N/A";
    const tagsHtml = workData?.tags && workData.tags.length > 0 ? workData.tags.map((t) => `<a href="/search?tag=${encodeURIComponent(t.name)}&img=${imgMode}&lang=${langMode}${transMode ? `&trans=${transMode}` : ""}" class="btn btn-sm" style="margin:2px 3px 2px 0;">#${escapeHtml(t.name)}</a>`).join(" ") : "None";
    const coverHtml = imgMode !== "0" && workData?.thumbnailCoverUrl ? `<div style="margin: 6px 0;"><img src="${escapeHtml(
      workData.thumbnailCoverUrl
    )}" width="160" height="160" alt="Cover" style="border:1px solid #94a3b8;" /></div>` : "";
    let tracksTableHtml = "";
    if (flattened.length === 0) {
      tracksTableHtml = `<div style="padding:8px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b; font-size:11px; margin:8px 0;">
        <strong>Notice:</strong> Tracks for this work are currently not available in the audio repository.
      </div>`;
    } else {
      tracksTableHtml = `
        <table class="track-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Track Name</th>
              <th>Size</th>
              <th>Duration</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
      `;
      for (const track of flattened) {
        const url = track.mediaDownloadUrl || track.mediaStreamUrl;
        const directDownloadUrl = url || "#";
        const trimmedTrackTitle = (track.title || "").trim();
        const translatedTrackName = trackTranslations[trimmedTrackTitle] || trackTranslations[track.title];
        let typeBadge = `<span class="badge">${escapeHtml(track.type.toUpperCase())}</span>`;
        let actionsHtml = "";
        if (track.type === "audio" && url) {
          typeBadge = `<span class="badge" style="background:#dbeafe; color:#1e40af;">AUDIO</span>`;
          actionsHtml = `<a href="${escapeHtml(directDownloadUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(track.title)}" class="btn btn-sm btn-green">[Download]</a>`;
        } else if (track.type === "text" && url) {
          typeBadge = `<span class="badge" style="background:#fef3c7; color:#92400e;">TXT</span>`;
          actionsHtml = `
            <a href="/text/${actualId}/${encodeURIComponent(track.hash || "")}?url=${encodeURIComponent(
            url
          )}&img=${imgMode}" class="btn btn-sm">[Read Script]</a>
            <a href="${escapeHtml(directDownloadUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(track.title)}" class="btn btn-sm btn-green">[Download]</a>
          `;
        } else if (url) {
          actionsHtml = `<a href="${escapeHtml(directDownloadUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(track.title)}" class="btn btn-sm btn-green">[Download]</a>`;
        }
        tracksTableHtml += `
          <tr>
            <td>${typeBadge}</td>
            <td class="track-name-cell" data-raw-title="${escapeHtml(track.title)}">
              <strong>${escapeHtml(translatedTrackName || track.title)}</strong>
              ${translatedTrackName && translatedTrackName !== track.title ? `<br /><span class="orig-subtitle" style="font-size:10px; color:#64748b;">Orig: ${escapeHtml(track.title)}</span>` : ""}
              <br /><span style="font-size:10px; color:#64748b;">${escapeHtml(track.path)}</span>
            </td>
            <td>${escapeHtml(formatBytes(track.size))}</td>
            <td>${escapeHtml(formatDuration(track.duration))}</td>
            <td>${actionsHtml}</td>
          </tr>
        `;
      }
      tracksTableHtml += `
          </tbody>
        </table>
      `;
    }
    const langInfo = getWorkLanguageLabel(workData || {});
    let editionsHtml = "";
    const edList = getLanguageEditions(workData);
    if (edList.length > 0) {
      editionsHtml = `<div style="margin-top: 4px; padding: 4px 6px; background:#f8fafc; border: 1px solid #cbd5e1; font-size:11px;">
        <strong>Language Editions:</strong>
        ${edList.map(
        (ed) => `<a href="/work/${encodeURIComponent(ed.workno)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}${transMode ? `&trans=${transMode}` : ""}">[${escapeHtml(ed.label)}: ${escapeHtml(ed.workno)}]</a>`
      ).join(" ")}
      </div>`;
    }
    const transSwitcherHtml = `
      <div style="margin: 6px 0; padding: 5px 8px; background: #eef2ff; border: 1px solid #c7d2fe; font-size: 11px;">
        <strong>Title Translation:</strong>
        ${!transMode ? "<strong>[Original JP]</strong>" : `<a href="/work/${encodeURIComponent(inputId)}?img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Original JP]</a>`} |
        ${transMode === "en" ? "<strong>[Translate to EN]</strong>" : `<a href="/work/${encodeURIComponent(inputId)}?trans=en&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Translate to EN]</a>`} |
        ${transMode === "vi" ? "<strong>[Translate to VI]</strong>" : `<a href="/work/${encodeURIComponent(inputId)}?trans=vi&img=${imgMode}&lang=${langMode}&tag=${encodeURIComponent(tagMode)}">[Translate to VI]</a>`}
      </div>
    `;
    let geminiPromptHtml = "";
    if ((transMode === "en" || transMode === "vi") && !isFullyCached) {
      geminiPromptHtml = `
        <div id="gemini-prompt-box" style="margin: 6px 0; padding: 8px 10px; background: #fefce8; border: 1px solid #eab308; font-size: 11px; color: #854d0e;">
          <div style="font-weight:bold; margin-bottom: 3px;">
            Google Gemini API Key Required for Title &amp; Track Translation
          </div>
          <div id="gemini-status-text" style="color: #713f12; margin-bottom: 6px;">
            ${missingCount} item(s) will be translated directly in your browser using your Gemini API key and uploaded to the server cache.
          </div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <button type="button" id="btn-run-gemini" class="btn btn-sm btn-green" onclick="window.runClientGeminiTranslation('${escapeHtml(transMode)}')">[Enter Gemini API Key &amp; Translate]</button>
            <button type="button" id="btn-change-gemini" class="btn btn-sm" onclick="window.promptSetGeminiKey()">[Change Key]</button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="font-size:10px; color:#0284c7; text-decoration:underline;">[Get Free Gemini API Key]</a>
          </div>
        </div>
      `;
    }
    const clientScriptHtml = transMode === "en" || transMode === "vi" ? `
      <script type="text/javascript">
        window.__transTexts = ${JSON.stringify(textsToTranslate)};
        window.__rawTitle = ${JSON.stringify(rawTitle)};
        window.__pendingTransMode = ${JSON.stringify(transMode)};
        window.__needsAutoTranslate = ${JSON.stringify(!isFullyCached)};
        window.__workInfo = ${JSON.stringify({
      id: actualId,
      rjCode,
      originalTitle: rawTitle,
      coverUrl: workData?.thumbnailCoverUrl || workData?.mainCoverUrl || "",
      circle: circleName,
      vas,
      totalTracks: flattened.length
    })};
      </script>
      <script type="text/javascript" src="/client-translator.js"></script>
    ` : "";
    const content = `
      <div style="margin-bottom: 10px;">
        <span class="badge badge-rj">${escapeHtml(rjCode)}</span>
        <span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">${escapeHtml(langInfo.label)}</span>
        ${transMode ? `<span class="badge" style="background:#dbeafe; color:#1e40af; font-weight:bold;">${escapeHtml(transMode === "vi" ? "VI Translated" : "EN Translated")}</span>` : ""}
        <span class="badge badge-rating">Rating: ${escapeHtml(String(workData?.rate_average_2dp || "N/A"))}</span>
        <h2 id="work-title-heading" style="font-size: 15px; margin: 4px 0;">${escapeHtml(displayTitle)}</h2>
        ${transMode && displayTitle !== rawTitle ? `<div id="work-title-orig" style="font-size:11px; color:#64748b; margin-bottom:4px;">Original: ${escapeHtml(rawTitle)}</div>` : ""}
        ${transSwitcherHtml}
        ${geminiPromptHtml}
        ${coverHtml}
        <div class="meta-tag">
          <strong>Language:</strong> ${escapeHtml(langInfo.label)} | <strong>Circle:</strong> ${escapeHtml(circleName)} | <strong>CV:</strong> ${escapeHtml(vas)}<br />
          <strong>Release:</strong> ${escapeHtml(workData?.release || "N/A")} | <strong>Price:</strong> &yen;${escapeHtml(
      String(workData?.price || 0)
    )}<br />
          <strong>Total Size:</strong> ${escapeHtml(formatBytes(totalSize))} | <strong>Tracks:</strong> ${audioTracks.length} audio, ${textTracks.length} text<br />
          <strong>Tags:</strong> ${tagsHtml}
        </div>
        ${editionsHtml}
      </div>

      ${flattened.length > 0 ? `
      <div style="margin: 6px 0;">
        <a href="/api/download/playlist.m3u?id=${actualId}" class="btn btn-green">[RealPlayer M3U]</a>
        <a href="/api/download/batch-links.txt?id=${actualId}" class="btn">[Links TXT]</a>
        <a href="/api/download/batch-script.sh?id=${actualId}" class="btn">[Script SH]</a>
        <a href="/api/download/zip/${actualId}" class="btn btn-amber">[ZIP Archive]</a>
      </div>
      ` : ""}

      <h3>Tracks (${flattened.length})</h3>
      ${tracksTableHtml}
      <div style="margin-top: 10px;">
        <a href="/search?q=${encodeURIComponent(circleName)}&img=${imgMode}">&laquo; More from Circle: ${escapeHtml(circleName)}</a>
      </div>
      ${clientScriptHtml}
    `;
    return res.send(renderRetroPage(displayTitle, content, rjCode, imgMode, langMode, tagMode));
  } catch (err) {
    console.error("Work view error:", err);
    return res.status(500).send(renderRetroPage("Error", `<p style="color:red;">Error loading work: ${escapeHtml(err.message)}</p>`, "", imgMode));
  }
}
async function handleTextRequest(req, res) {
  const workId = req.params.workId;
  const targetUrl = req.query.url;
  const imgMode = req.query.img || "1";
  const targetLang = req.query.targetLang || "orig";
  const mode = req.query.mode || (targetLang !== "orig" ? "translated" : "orig");
  const tone = req.query.tone || "asmr";
  if (!targetUrl) {
    return res.status(400).send("Missing script URL");
  }
  try {
    const upstreamRes = await fetch(targetUrl, { headers: ASMR_API_HEADERS });
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send("Failed to fetch script text");
    }
    const rawTextContent = await upstreamRes.text();
    const scriptHash = String(req.params.hash || "script").trim();
    const cleanMode = mode === "bilingual" ? "bilingual" : "translated";
    const cacheKey = getScriptCacheKey(scriptHash || rawTextContent, { targetLang, mode: cleanMode });
    let displayContent = rawTextContent;
    let translationMetaHtml = "";
    let isTranslated = false;
    let clientScriptHtml = "";
    const langLabels = {
      en: "English (ENG)",
      vi: "Vietnamese (VIE)",
      "zh-hans": "Simplified Chinese (CHI-S)",
      "zh-hant": "Traditional Chinese (CHI-T)",
      ko: "Korean (KOR)",
      ja: "Japanese (JPN)",
      es: "Spanish (ESP)",
      fr: "French (FRA)",
      de: "German (DEU)",
      ru: "Russian (RUS)",
      id: "Indonesian (IDN)",
      th: "Thai (THA)"
    };
    const activeLangLabel = langLabels[targetLang] || targetLang.toUpperCase();
    const modeLabel = cleanMode === "bilingual" ? "Bilingual Interleaved" : "Translated Only";
    if (targetLang && targetLang !== "orig") {
      const cachedRecord = getCachedScriptTranslation(cacheKey);
      if (cachedRecord && cachedRecord.translatedText) {
        displayContent = cachedRecord.translatedText;
        isTranslated = true;
        translationMetaHtml = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px; margin-bottom:10px; font-size:11px; color:#166534;">
            <strong>\u2713 Translated with Gemini Flash Lite AI</strong> &bull; <strong>Language:</strong> ${escapeHtml(activeLangLabel)} &bull; <strong>Mode:</strong> ${escapeHtml(modeLabel)}<br />
            <strong>Status:</strong> Loaded from permanent server cache (Skipped translation, 0 API calls used) &bull; <strong>Characters:</strong> ${(cachedRecord.charCount || cachedRecord.translatedText.length).toLocaleString()}<br />
            <div style="margin-top:6px;">
              <a href="/api/download/translated-script?url=${encodeURIComponent(targetUrl)}&targetLang=${encodeURIComponent(targetLang)}&mode=${encodeURIComponent(cleanMode)}&name=script_${workId}.txt" class="btn btn-sm btn-green">[Download Translated TXT]</a>
              <a href="/text/${workId}/${encodeURIComponent(req.params.hash)}?url=${encodeURIComponent(targetUrl)}&img=${imgMode}&targetLang=orig" class="btn btn-sm">[View Original Text]</a>
            </div>
          </div>
        `;
      } else {
        translationMetaHtml = `
          <div id="gemini-script-box" style="margin: 6px 0 10px 0; padding: 8px 10px; background: #fefce8; border: 1px solid #eab308; font-size: 11px; color: #854d0e;">
            <div id="gemini-script-status" style="color: #713f12; margin-bottom: 6px;">
              This script has not been translated to <strong>${escapeHtml(activeLangLabel)}</strong> yet. Translate client-side with Google Gemini (Flash Lite) and save permanently to server cache!
            </div>
            <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
              <button type="button" id="btn-run-script-gemini" class="btn btn-sm btn-green" onclick="window.runClientGeminiScriptTranslation()">[Translate Script with Gemini AI (Flash Lite)]</button>
              <button type="button" id="btn-change-script-gemini" class="btn btn-sm" onclick="window.promptSetGeminiKey()">[Change Key]</button>
              <a href="/api/download/translated-script?url=${encodeURIComponent(targetUrl)}&targetLang=${encodeURIComponent(targetLang)}&mode=${encodeURIComponent(cleanMode)}&name=script_${workId}.txt" id="btn-download-translated-script" class="btn btn-sm btn-green" style="display:none;">[Download Translated TXT]</a>
              <a href="/text/${workId}/${encodeURIComponent(req.params.hash)}?url=${encodeURIComponent(targetUrl)}&img=${imgMode}&targetLang=orig" class="btn btn-sm">[View Original Text]</a>
            </div>
          </div>
        `;
        clientScriptHtml = `
          <script type="text/javascript">
            window.__scriptData = {
              workId: ${JSON.stringify(workId)},
              hash: ${JSON.stringify(scriptHash)},
              targetUrl: ${JSON.stringify(targetUrl)},
              targetLang: ${JSON.stringify(targetLang)},
              mode: ${JSON.stringify(cleanMode)},
              cacheKey: ${JSON.stringify(cacheKey)},
              rawText: ${JSON.stringify(rawTextContent)}
            };
            window.__needsAutoTranslateScript = true;
          </script>
          <script type="text/javascript" src="/client-translator.js"></script>
        `;
      }
    }
    const downloadOriginalUrl = `/api/download/file?url=${encodeURIComponent(targetUrl)}&name=script_${workId}_orig.txt`;
    const content = `
      <div style="margin-bottom: 8px;">
        <a href="/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
        <a href="${downloadOriginalUrl}" class="btn btn-sm btn-green" style="margin-left:4px;">[Download Original TXT]</a>
      </div>

      <div class="search-box" style="background:#f1f5f9; border-color:#cbd5e1; margin-bottom:10px;">
        <strong>Script Translation:</strong>
        <form action="/text/${workId}/${encodeURIComponent(req.params.hash)}" method="GET" style="margin-top:6px;">
          <input type="hidden" name="url" value="${escapeHtml(targetUrl)}" />
          <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
          
          <label for="targetLang"><strong>Target:</strong></label>
          <select name="targetLang" id="targetLang" style="font-size:11px; padding:2px; margin-right:4px;">
            <option value="orig" ${targetLang === "orig" ? "selected" : ""}>Original</option>
            <option value="en" ${targetLang === "en" ? "selected" : ""}>English (ENG)</option>
            <option value="vi" ${targetLang === "vi" ? "selected" : ""}>Vietnamese (VIE)</option>
            <option value="zh-hans" ${targetLang === "zh-hans" ? "selected" : ""}>Simplified Chinese (CHI-S)</option>
            <option value="zh-hant" ${targetLang === "zh-hant" ? "selected" : ""}>Traditional Chinese (CHI-T)</option>
            <option value="ko" ${targetLang === "ko" ? "selected" : ""}>Korean (KOR)</option>
            <option value="ja" ${targetLang === "ja" ? "selected" : ""}>Japanese (JPN)</option>
            <option value="es" ${targetLang === "es" ? "selected" : ""}>Spanish (ESP)</option>
            <option value="fr" ${targetLang === "fr" ? "selected" : ""}>French (FRA)</option>
            <option value="de" ${targetLang === "de" ? "selected" : ""}>German (DEU)</option>
            <option value="ru" ${targetLang === "ru" ? "selected" : ""}>Russian (RUS)</option>
            <option value="id" ${targetLang === "id" ? "selected" : ""}>Indonesian (IDN)</option>
            <option value="th" ${targetLang === "th" ? "selected" : ""}>Thai (THA)</option>
          </select>

          <label for="mode"><strong>Mode:</strong></label>
          <select name="mode" id="mode" style="font-size:11px; padding:2px; margin-right:4px;">
            <option value="translated" ${cleanMode === "translated" ? "selected" : ""}>Translated Only</option>
            <option value="bilingual" ${cleanMode === "bilingual" ? "selected" : ""}>Bilingual Interleaved</option>
            <option value="orig" ${targetLang === "orig" ? "selected" : ""}>Original Only</option>
          </select>

          <input type="submit" value="Translate" class="btn btn-sm" />
        </form>
      </div>

      ${translationMetaHtml}

      <h3>${isTranslated ? "Translated Script" : "Original Script"}</h3>
      <div id="script-content-display" style="background:#ffffff; border:1px solid #cbd5e1; padding:10px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-wrap:break-word; max-height:650px; overflow-y:auto; line-height:1.5; color:#0f172a;">
${escapeHtml(displayContent)}
      </div>
      <div style="margin-top: 8px;">
        <a href="/work/${workId}?img=${imgMode}" class="btn btn-sm">&laquo; Back to Work Details</a>
      </div>
      ${clientScriptHtml}
    `;
    return res.send(renderRetroPage(isTranslated ? `Script (${targetLang.toUpperCase()})` : "Script Viewer", content, "", imgMode));
  } catch (err) {
    return res.status(500).send("Error reading or translating script text");
  }
}
async function handleTranslatedPageRequest(req, res) {
  const imgMode = req.query.img || "1";
  const langMode = req.query.lang || "all";
  const searchQuery = req.query.q || "";
  const cleanLang = langMode === "en" || langMode === "vi" ? langMode : "all";
  const translatedWorks = getPermanentTranslatedWorks(cleanLang, searchQuery);
  const stats = getPermanentTranslationStats();
  let worksHtml = "";
  if (translatedWorks.length === 0) {
    worksHtml = `
      <div class="info-box" style="padding:12px; margin:10px 0; background:#f8fafc; border:1px solid #cbd5e1;">
        <strong>No translated works found ${searchQuery ? `matching "${escapeHtml(searchQuery)}"` : "in the vault yet"}.</strong>
        <p style="margin:6px 0 0 0; color:#475569; font-size:11px;">
          When any user translates titles and tracks with Google Gemini (client-side), the translated work is permanently saved into this server vault and displayed here for everyone to browse!
        </p>
        <p style="margin:6px 0 0 0;">
          <a href="/?img=${imgMode}&lang=${langMode}" class="btn btn-sm">&laquo; Browse Works to Translate</a>
        </p>
      </div>
    `;
  } else {
    for (const w of translatedWorks) {
      const coverHtml = imgMode !== "0" && w.coverUrl ? `<div style="margin: 4px 0;"><img src="${escapeHtml(w.coverUrl)}" width="120" height="120" alt="Cover" style="border:1px solid #cbd5e1;" /></div>` : "";
      const enTitle = w.translatedTitle?.en;
      const viTitle = w.translatedTitle?.vi;
      let displayTitle = enTitle || viTitle || w.originalTitle;
      if (cleanLang === "vi" && viTitle) displayTitle = viTitle;
      if (cleanLang === "en" && enTitle) displayTitle = enTitle;
      const trackInfo = w.totalTracksCount ? `${w.translatedTracksCount}/${w.totalTracksCount} tracks translated` : `${w.translatedTracksCount} tracks translated`;
      const dateFormatted = w.translatedAt ? new Date(w.translatedAt).toLocaleDateString() : "";
      worksHtml += `
        <div class="work-item">
          <span class="badge badge-rj">${escapeHtml(w.rjCode)}</span>
          ${enTitle ? '<span class="badge" style="background:#dbeafe; color:#1e40af; font-weight:bold;">\u{1F1EC}\u{1F1E7} EN</span>' : ""}
          ${viTitle ? '<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:bold;">\u{1F1FB}\u{1F1F3} VI</span>' : ""}
          <span class="badge" style="background:#f0fdf4; color:#166534; font-weight:bold;">\u2713 ${escapeHtml(trackInfo)}</span>
          <div class="work-title">
            <a href="/work/${encodeURIComponent(w.rjCode || String(w.id))}?trans=${cleanLang !== "all" ? cleanLang : "en"}&img=${imgMode}">${escapeHtml(displayTitle)}</a>
          </div>
          ${w.originalTitle && displayTitle !== w.originalTitle ? `<div style="font-size:11px; color:#64748b; margin-bottom:3px;">Orig: ${escapeHtml(w.originalTitle)}</div>` : ""}
          ${coverHtml}
          <div class="meta-tag">
            Circle: <strong>${escapeHtml(w.circle || "N/A")}</strong> | CV: ${escapeHtml(w.vas || "N/A")}<br />
            Permanent Vault Entry: ${escapeHtml(dateFormatted)}
          </div>
          <div style="margin-top: 4px;">
            <a href="/work/${encodeURIComponent(w.rjCode || String(w.id))}?trans=${cleanLang !== "all" ? cleanLang : "en"}&img=${imgMode}" class="btn btn-sm">[View Tracks]</a>
            <a href="/api/download/playlist.m3u?id=${encodeURIComponent(String(w.id || w.rjCode))}" class="btn btn-green btn-sm">[M3U Playlist]</a>
          </div>
        </div>
      `;
    }
  }
  const content = `
    <div style="margin-bottom: 8px; padding: 8px 10px; background: #e0f2fe; border: 1px solid #7dd3fc; font-size: 11px; color: #0369a1;">
      <strong>Permanent Translated Works Vault</strong> &bull; Total Works: <strong>${stats.totalWorks}</strong> (EN: <strong>${stats.enWorksCount}</strong>, VI: <strong>${stats.viWorksCount}</strong>, Cached Titles: <strong>${stats.totalTitlesCached}</strong>)
      <br /><span style="font-size:10px; color:#0c4a6e;">All works listed here have their titles and tracks permanently stored in the server vault. Translated client-side via Gemini API.</span>
    </div>

    <div class="search-box">
      <form action="/translated" method="GET">
        <input type="hidden" name="img" value="${escapeHtml(imgMode)}" />
        <input type="text" name="q" placeholder="Search translated works..." value="${escapeHtml(searchQuery)}" style="margin-bottom:4px;" /><br />
        <label for="lang"><strong>Filter Language:</strong></label>
        <select name="lang" id="lang" style="font-size:11px; padding:2px; margin-right:4px;">
          <option value="all" ${cleanLang === "all" ? "selected" : ""}>All Translated Works (${stats.totalWorks})</option>
          <option value="en" ${cleanLang === "en" ? "selected" : ""}>English Translations (${stats.enWorksCount})</option>
          <option value="vi" ${cleanLang === "vi" ? "selected" : ""}>Vietnamese Translations (${stats.viWorksCount})</option>
        </select>
        <input type="submit" value="Filter Vault" />
        ${searchQuery ? `<a href="/translated?lang=${cleanLang}&img=${imgMode}" style="font-size:11px; margin-left:6px;">[Clear Search]</a>` : ""}
      </form>
    </div>

    ${worksHtml}
  `;
  return res.send(renderRetroPage("Translated Works Vault", content, "", imgMode, langMode));
}
app2.get("/", handleHomeRequest);
app2.get("/search", handleSearchRequest);
app2.get("/work/:id", handleWorkRequest);
app2.get("/text/:workId/:hash", handleTextRequest);
app2.get("/translated", handleTranslatedPageRequest);
app2.get("/classic", handleHomeRequest);
app2.get("/classic/search", handleSearchRequest);
app2.get("/classic/work/:id", handleWorkRequest);
app2.get("/classic/text/:workId/:hash", handleTextRequest);
app2.get("/classic/translated", handleTranslatedPageRequest);
async function startServer() {
  try {
    await initFirestoreVaultSync();
  } catch (fsErr) {
    console.warn("Firestore initial sync error:", fsErr);
  }
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app2.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(__dirname, "dist");
    if (fs2.existsSync(distPath)) {
      app2.use(express.static(distPath));
      app2.get("*", (_req, res) => {
        res.sendFile(path2.join(distPath, "index.html"));
      });
    }
  }
  app2.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`RetroASMR Engine running at http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
