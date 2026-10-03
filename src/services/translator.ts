import { GoogleGenAI } from '@google/genai';

export interface TranslateOptions {
  targetLang: string;
  sourceLang?: string;
  mode?: 'translated' | 'bilingual' | 'annotations';
  tone?: 'asmr' | 'natural' | 'literal';
}

export interface TranslateResult {
  translatedText: string;
  targetLang: string;
  sourceLang: string;
  mode: 'translated' | 'bilingual' | 'annotations';
  charCount: number;
  engine: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  'zh-hans': 'Simplified Chinese (简体中文)',
  'zh-cn': 'Simplified Chinese (简体中文)',
  zh: 'Simplified Chinese (简体中文)',
  'zh-hant': 'Traditional Chinese (繁體中文)',
  'zh-tw': 'Traditional Chinese (繁體中文)',
  'zh-hk': 'Traditional Chinese (繁體中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  vi: 'Vietnamese (Tiếng Việt)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ru: 'Russian (Русский)',
  id: 'Indonesian (Bahasa Indonesia)',
  th: 'Thai (ไทย)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)',
};

function getLangName(code: string): string {
  const normalized = code.toLowerCase().trim();
  return LANGUAGE_NAMES[normalized] || code;
}

let geminiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

/**
 * Free Google Translate fallback for offline / keyless environments
 */
async function fallbackGoogleTranslate(text: string, targetLang: string): Promise<string> {
  const cleanTarget = targetLang.split('-')[0] || 'en';
  // Split into chunks of ~1500 chars to avoid URL length limits
  const paragraphs = text.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of paragraphs) {
    if ((currentChunk + '\n' + line).length > 1200) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
        cleanTarget
      )}&dt=t&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        const translatedPart = (data[0] || []).map((item: any) => item[0]).join('');
        translatedChunks.push(translatedPart || chunk);
      } else {
        translatedChunks.push(chunk);
      }
    } catch {
      translatedChunks.push(chunk);
    }
  }

  return translatedChunks.join('\n');
}

/**
 * Main translation function utilizing Gemini 3.8 Flash with smart script handling
 */
export async function translateScript(
  text: string,
  options: TranslateOptions
): Promise<TranslateResult> {
  const targetLang = options.targetLang || 'en';
  const targetLangName = getLangName(targetLang);
  const mode = options.mode || 'translated';
  const tone = options.tone || 'asmr';
  const sourceLang = options.sourceLang || 'Japanese';

  if (!text || text.trim().length === 0) {
    return {
      translatedText: '',
      targetLang,
      sourceLang,
      mode,
      charCount: 0,
      engine: 'none',
    };
  }

  const ai = getGenAI();

  if (ai) {
    try {
      let promptInstruction = `You are a professional voice drama, ASMR script, and dialogue subtitle translator.
Your task is to accurately translate the provided ASMR / voice drama / audio script into ${targetLangName}.

Translation Rules:
1. Preserve all timecodes (e.g., [00:12.34], 00:01:23 --> 00:01:28, etc.) and file metadata headers intact.
2. Preserve sound effect tags, whisper notes, breath cues, and stage directions (e.g., (耳元で囁く), (吐息), [SE: 雨音], (kiss), etc.) translated naturally in parentheses or brackets.
3. Preserve speaker indicators (e.g. CV:, 【...】, character names).
4. Tone Style: ${
        tone === 'asmr'
          ? 'Immersive ASMR roleplay: highly natural, expressive, intimate, capturing emotional nuances, playful tease, and soothing speech patterns.'
          : tone === 'literal'
          ? 'Faithful and precise literal translation matching the original phrasing.'
          : 'Natural and fluent everyday conversational dialogue.'
      }`;

      if (mode === 'bilingual') {
        promptInstruction += `
5. FORMAT: Provide a BILINGUAL output. For each meaningful line or dialogue sentence, output:
[Original Line]
[Translated in ${targetLangName}]
Keep lines synced and aligned so listeners can follow along with the audio while reading.`;
      } else {
        promptInstruction += `
5. FORMAT: Provide the clean TRANSLATED text directly in ${targetLangName}, maintaining identical line breaks and structural formatting of the original script.`;
      }

      promptInstruction += `
Do NOT add extra conversational commentary, preambles, or markdown backticks around the whole output. Output ONLY the translated script text.`;

      // Split text into chunks if it exceeds ~8,000 characters
      const maxChunkLength = 7000;
      if (text.length <= maxChunkLength) {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [{ text: `${promptInstruction}\n\n--- SCRIPT TO TRANSLATE ---\n${text}` }],
            },
          ],
        });

        const translated = (response.text || '').trim();
        if (translated) {
          return {
            translatedText: translated,
            targetLang,
            sourceLang,
            mode,
            charCount: translated.length,
            engine: 'gemini-3.8-flash',
          };
        }
      } else {
        // Chunk processing for long scripts
        const lines = text.split('\n');
        const chunks: string[] = [];
        let curr = '';
        for (const line of lines) {
          if ((curr + '\n' + line).length > maxChunkLength) {
            if (curr) chunks.push(curr);
            curr = line;
          } else {
            curr = curr ? `${curr}\n${line}` : line;
          }
        }
        if (curr) chunks.push(curr);

        const translatedParts: string[] = [];
        for (const chunk of chunks) {
          const chunkRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
              {
                role: 'user',
                parts: [{ text: `${promptInstruction}\n\n--- SCRIPT PART ---\n${chunk}` }],
              },
            ],
          });
          translatedParts.push((chunkRes.text || '').trim() || chunk);
        }

        const fullTranslated = translatedParts.join('\n\n');
        return {
          translatedText: fullTranslated,
          targetLang,
          sourceLang,
          mode,
          charCount: fullTranslated.length,
          engine: 'gemini-3.8-flash',
        };
      }
    } catch (err) {
      console.warn('Gemini translation error, using fallback:', err);
    }
  }

  // Fallback translation
  const fallbackTranslated = await fallbackGoogleTranslate(text, targetLang);
  let finalResult = fallbackTranslated;

  if (mode === 'bilingual') {
    const origLines = text.split('\n');
    const transLines = fallbackTranslated.split('\n');
    const combined: string[] = [];
    for (let i = 0; i < Math.max(origLines.length, transLines.length); i++) {
      const o = origLines[i] || '';
      const t = transLines[i] || '';
      if (o.trim()) combined.push(o);
      if (t.trim() && t.trim() !== o.trim()) combined.push(`  → ${t}`);
      if (!o.trim() && !t.trim()) combined.push('');
    }
    finalResult = combined.join('\n');
  }

  return {
    translatedText: finalResult,
    targetLang,
    sourceLang,
    mode,
    charCount: finalResult.length,
    engine: 'google-translate-fallback',
  };
}
