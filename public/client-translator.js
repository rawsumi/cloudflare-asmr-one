/**
 * Client-Side Gemini Title & Track Translator for Retro ASMR
 * Prompts user for Google Gemini API key and executes translation directly in browser,
 * uploading results to the server cache.
 */
(function () {
  var STORAGE_KEY = 'retroasmr_gemini_api_key';

  var LANGUAGE_NAME_MAP = {
    en: 'English',
    vi: 'Vietnamese (Tiếng Việt)',
    'zh-hans': 'Simplified Chinese (简体中文)',
    'zh-hant': 'Traditional Chinese (繁體中文)',
    ko: 'Korean (한국어)',
    ja: 'Japanese (日本語)',
    es: 'Spanish (Español)',
    fr: 'French (Français)',
    de: 'German (Deutsch)',
    ru: 'Russian (Русский)',
    id: 'Indonesian (Bahasa Indonesia)',
    th: 'Thai (ไทย)',
    pt: 'Portuguese (Português)',
    it: 'Italian (Italiano)'
  };

  function sanitizeMsg(msg) {
    if (!msg) return '';
    return String(msg)
      .replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=[REDACTED]')
      .replace(/AIza[a-zA-Z0-9_\-]{30,}/g, '[REDACTED_API_KEY]');
  }

  window.promptSetGeminiKey = function () {
    var current = localStorage.getItem(STORAGE_KEY) || '';
    var key = prompt('Please enter your Google Gemini API Key (starts with AIza...):', current);
    if (key !== null) {
      key = key.trim();
      if (key) {
        localStorage.setItem(STORAGE_KEY, key);
        alert('Gemini API key saved! Click [Translate] to proceed.');
        if (window.__pendingTransMode) {
          window.runClientGeminiTranslation(window.__pendingTransMode);
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  window.runClientGeminiTranslation = async function (targetLang) {
    window.__pendingTransMode = targetLang;
    var statusEl = document.getElementById('gemini-status-text');
    var btn = document.getElementById('btn-run-gemini');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Checking server cache...';

    var texts = window.__transTexts || [];
    var rawTitle = window.__rawTitle || '';
    var workInfo = window.__workInfo || null;

    try {
      // 1. Check server cache first before asking for any API key
      var cacheRes = await fetch('/api/translate/cached-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: texts, targetLang: targetLang }),
      });
      var cacheData = await cacheRes.json();
      var missing = cacheData.missing || [];
      var translations = cacheData.cached || {};

      // 2. CHECK: If all items are already translated, skip translating completely!
      if (missing.length === 0 && texts.length > 0) {
        if (workInfo) {
          fetch('/api/translate/cache-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetLang: targetLang, translations: translations, workInfo: workInfo }),
          }).catch(function () {});
        }
        if (statusEl) {
          statusEl.innerHTML = '<strong style="color:#16a34a;">✓ Work title and tracks are already translated &amp; cached on server. Skipped translation (no API calls used).</strong>';
        }
        var pBox = document.getElementById('gemini-prompt-box');
        if (pBox) {
          pBox.style.background = '#f0fdf4';
          pBox.style.borderColor = '#86efac';
          pBox.style.color = '#166534';
        }
        if (btn) btn.style.display = 'none';

        // Update DOM from cache
        var headingEl = document.getElementById('work-title-heading');
        if (headingEl && translations[rawTitle]) {
          headingEl.textContent = translations[rawTitle];
        }
        var cells = document.querySelectorAll('.track-name-cell');
        cells.forEach(function (cell) {
          var orig = cell.getAttribute('data-raw-title');
          if (orig && translations[orig]) {
            var strong = cell.querySelector('strong');
            if (strong) strong.textContent = translations[orig];
          }
        });
        return;
      }

      // 3. Only if missing items exist, require Gemini API key
      var key = (localStorage.getItem(STORAGE_KEY) || '').trim();
      if (!key) {
        key = prompt(
          'A Google Gemini API Key is required to translate ' + missing.length + ' item(s).\n\nPlease enter your Gemini API Key (starts with AIza...):'
        );
        if (!key || !key.trim()) {
          if (btn) btn.disabled = false;
          if (statusEl) statusEl.textContent = 'Translation paused: Gemini API key required.';
          return;
        }
        key = key.trim();
        localStorage.setItem(STORAGE_KEY, key);
      }

      // 4. Translate ONLY the missing items client-side
      if (missing.length > 0) {
        if (statusEl) {
          statusEl.textContent = 'Translating ' + missing.length + ' item(s) client-side with Google Gemini...';
        }

        var targetLangName = targetLang === 'vi' ? 'Vietnamese (Tiếng Việt)' : 'English';
        var batchObjects = missing.map(function (t, idx) {
          return { id: idx, original: t };
        });

        var promptText =
          'You are an expert audio drama, ASMR, and voice work title translator.\n' +
          'Translate each title and track name into ' +
          targetLangName +
          '.\n' +
          'Translate voice drama terms accurately (ear cleaning, whispering, breathing, co-sleeping, lap pillow, sweet pampering, ear licking, etc.).\n' +
          'Return a JSON array where each object has: "id" (integer), "original", and "translated".';

        var models = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
        var parsed = null;
        var lastErr = null;

        for (var m = 0; m < models.length; m++) {
          try {
            var gUrl =
              'https://generativelanguage.googleapis.com/v1beta/models/' +
              models[m] +
              ':generateContent?key=' +
              encodeURIComponent(key);

            var gRes = await fetch(gUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: promptText + '\n\nITEMS TO TRANSLATE:\n' + JSON.stringify(batchObjects),
                      },
                    ],
                  },
                ],
                generationConfig: {
                  responseMimeType: 'application/json',
                },
              }),
            });

            if (!gRes.ok) {
              var gErr = await gRes.json().catch(function () {
                return {};
              });
              var rawMsg = gErr.error && gErr.error.message ? gErr.error.message : 'HTTP ' + gRes.status;
              throw new Error(sanitizeMsg(rawMsg));
            }

            var gData = await gRes.json();
            var rawText =
              gData.candidates &&
              gData.candidates[0] &&
              gData.candidates[0].content &&
              gData.candidates[0].content.parts &&
              gData.candidates[0].content.parts[0]
                ? gData.candidates[0].content.parts[0].text
                : '';

            if (rawText) {
              var cleanJson = rawText.trim();
              if (cleanJson.indexOf('```') !== -1) {
                var lines = cleanJson.split(/\r?\n/);
                if (lines[0] && lines[0].indexOf('```') !== -1) lines.shift();
                if (lines.length && lines[lines.length - 1].indexOf('```') !== -1) lines.pop();
                cleanJson = lines.join('\n').trim();
              }
              parsed = JSON.parse(cleanJson);
              break;
            }
          } catch (callErr) {
            lastErr = new Error(sanitizeMsg(callErr.message));
            if (
              callErr.message &&
              (callErr.message.indexOf('API_KEY') !== -1 ||
                callErr.message.indexOf('quota') !== -1 ||
                callErr.message.indexOf('RESOURCE_EXHAUSTED') !== -1)
            ) {
              throw lastErr;
            }
          }
        }

        if (!parsed) {
          throw lastErr || new Error('Failed to generate translation from Gemini API');
        }

        var list = Array.isArray(parsed) ? parsed : parsed.items || parsed.translations || [];
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          if (!item) continue;
          var trans = (item.translated || item.text || '').trim();
          var orig =
            typeof item.id === 'number' && missing[item.id] ? missing[item.id] : (item.original || '').trim();
          if (orig && trans) {
            translations[orig] = trans;
          }
        }

        // 5. Upload new translations to server cache and permanent vault (NO api key sent)
        if (statusEl) statusEl.textContent = 'Saving translations to permanent server vault...';
        await fetch('/api/translate/cache-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLang: targetLang, translations: translations, workInfo: workInfo }),
        });
      }

      // 6. Update the page DOM in real-time
      var headingEl = document.getElementById('work-title-heading');
      if (headingEl && translations[rawTitle]) {
        headingEl.textContent = translations[rawTitle];
      }

      var cells = document.querySelectorAll('.track-name-cell');
      cells.forEach(function (cell) {
        var orig = cell.getAttribute('data-raw-title');
        if (orig && translations[orig]) {
          var strong = cell.querySelector('strong');
          if (strong) strong.textContent = translations[orig];
        }
      });

      if (statusEl) {
        statusEl.innerHTML =
          '<strong style="color:#16a34a;">✓ Translation completed &amp; permanently saved to server vault!</strong>';
      }
      var pBox = document.getElementById('gemini-prompt-box');
      if (pBox) {
        pBox.style.background = '#f0fdf4';
        pBox.style.borderColor = '#86efac';
        pBox.style.color = '#166534';
      }
      if (btn) btn.style.display = 'none';
    } catch (err) {
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#dc2626;">Error: ' + sanitizeMsg(err.message || err) + '</span>';
      }
      if (btn) btn.disabled = false;
    }
  };

  // ==============================================================
  // SCRIPT TRANSLATION CLIENT WORKFLOW (Gemini Flash Lite)
  // ==============================================================
  window.runClientGeminiScriptTranslation = async function () {
    var scriptData = window.__scriptData;
    if (!scriptData || !scriptData.rawText) return;

    var statusEl = document.getElementById('gemini-script-status');
    var btn = document.getElementById('btn-run-script-gemini');
    var displayEl = document.getElementById('script-content-display');

    if (btn) btn.disabled = true;

    try {
      // 1. Check if already cached on server (Smart Skip)
      if (statusEl) statusEl.textContent = 'Checking server script cache...';
      var cacheRes = await fetch('/api/translate/script-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hash: scriptData.hash,
          text: scriptData.rawText,
          targetLang: scriptData.targetLang,
          mode: scriptData.mode,
        }),
      });
      var cacheJson = await cacheRes.json();
      if (cacheJson.cached && cacheJson.translatedText) {
        if (displayEl) displayEl.textContent = cacheJson.translatedText;
        if (statusEl) {
          statusEl.innerHTML = '<strong style="color:#16a34a;">✓ Script is already translated &amp; loaded from server cache. (No API calls used)</strong>';
        }
        var pBox = document.getElementById('gemini-script-box');
        if (pBox) {
          pBox.style.background = '#f0fdf4';
          pBox.style.borderColor = '#86efac';
          pBox.style.color = '#166534';
        }
        if (btn) btn.style.display = 'none';
        return;
      }

      // 2. Get API key from localStorage or prompt
      var key = (localStorage.getItem(STORAGE_KEY) || '').trim();
      if (!key) {
        key = prompt('A Google Gemini API Key is required to translate this script.\n\nPlease enter your Gemini API Key (starts with AIza...):');
        if (!key || !key.trim()) {
          if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;">Translation cancelled: Gemini API key required.</span>';
          if (btn) btn.disabled = false;
          return;
        }
        key = key.trim();
        localStorage.setItem(STORAGE_KEY, key);
      }

      // 3. Chunk text if large (natural line boundary chunking)
      var maxChunk = 2500;
      var rawLines = scriptData.rawText.split('\n');
      var chunks = [];
      var curChunk = [];
      var curLen = 0;

      for (var i = 0; i < rawLines.length; i++) {
        var line = rawLines[i];
        if (curLen + line.length + 1 > maxChunk && curChunk.length > 0) {
          chunks.push(curChunk.join('\n'));
          curChunk = [line];
          curLen = line.length + 1;
        } else {
          curChunk.push(line);
          curLen += line.length + 1;
        }
      }
      if (curChunk.length > 0) chunks.push(curChunk.join('\n'));

      var targetLangName = LANGUAGE_NAME_MAP[scriptData.targetLang.toLowerCase()] || scriptData.targetLang.toUpperCase();
      var translatedChunks = [];
      var models = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];

      for (var c = 0; c < chunks.length; c++) {
        if (statusEl) {
          statusEl.textContent = 'Translating script chunk ' + (c + 1) + ' of ' + chunks.length + ' with Gemini Flash Lite...';
        }

        var promptText =
          'You are an expert audio drama, ASMR, and subtitle script translator.\n' +
          'Translate the following script dialogue and stage directions into ' + targetLangName + '.\n' +
          'Preserve formatting, character names, brackets (like 【...】, （...）), breathing tags, and whispering nuances.\n' +
          (scriptData.mode === 'bilingual'
            ? 'For each dialogue line or paragraph, output the original line followed by its translation.\n'
            : 'Output only the translated script lines.\n') +
          'Do not add any conversational remarks, introduction, or conclusion.\n\n' +
          'Script chunk:\n' + chunks[c];

        var chunkResult = null;
        var lastErr = null;

        for (var m = 0; m < models.length; m++) {
          try {
            var gUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + models[m] + ':generateContent?key=' + encodeURIComponent(key);
            var gRes = await fetch(gUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.3 }
              })
            });

            if (gRes.ok) {
              var gData = await gRes.json();
              var cand = gData && gData.candidates && gData.candidates[0] && gData.candidates[0].content && gData.candidates[0].content.parts && gData.candidates[0].content.parts[0] && gData.candidates[0].content.parts[0].text;
              if (cand && cand.trim()) {
                chunkResult = cand.trim();
                break;
              }
            } else {
              var errJson = await gRes.json().catch(function() { return {}; });
              lastErr = (errJson && errJson.error && errJson.error.message) || ('HTTP ' + gRes.status);
            }
          } catch (e) {
            lastErr = e.message || 'Network error';
          }
        }

        if (!chunkResult) {
          throw new Error('Chunk ' + (c + 1) + '/' + chunks.length + ' failed: ' + sanitizeMsg(lastErr || 'Gemini error'));
        }

        translatedChunks.push(chunkResult);
      }

      var finalTranslated = translatedChunks.join('\n\n');
      if (displayEl) displayEl.textContent = finalTranslated;

      // 4. Upload to server cache (strictly NO API key sent)
      if (statusEl) statusEl.textContent = 'Permanently saving script to server cache...';
      await fetch('/api/translate/script-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cacheKey: scriptData.cacheKey,
          hash: scriptData.hash,
          text: scriptData.rawText,
          targetLang: scriptData.targetLang,
          mode: scriptData.mode,
          translatedText: finalTranslated,
          workId: scriptData.workId
        })
      });

      if (statusEl) {
        statusEl.innerHTML = '<strong style="color:#16a34a;">✓ Script translated with Gemini Flash Lite AI &amp; permanently saved to server cache!</strong>';
      }
      var pBox = document.getElementById('gemini-script-box');
      if (pBox) {
        pBox.style.background = '#f0fdf4';
        pBox.style.borderColor = '#86efac';
        pBox.style.color = '#166534';
      }
      if (btn) btn.style.display = 'none';

      // Update download link
      var downloadLink = document.getElementById('btn-download-translated-script');
      if (downloadLink) {
        downloadLink.style.display = 'inline-block';
      }
    } catch (err) {
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#dc2626;">Error: ' + sanitizeMsg(err.message || err) + '</span>';
      }
      if (btn) btn.disabled = false;
    }
  };

  // Auto-init on page load if elements exist
  document.addEventListener('DOMContentLoaded', function () {
    if (window.__needsAutoTranslate && window.__pendingTransMode) {
      window.runClientGeminiTranslation(window.__pendingTransMode);
    }
    if (window.__needsAutoTranslateScript && window.__scriptData) {
      window.runClientGeminiScriptTranslation();
    }
  });
})();
