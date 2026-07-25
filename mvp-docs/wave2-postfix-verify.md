# Post-fix Independent Verification (T0.3–T0.6)

**Date:** Sat Jul 25 2026  
**Worktrees verified:** t0.3-kanji-etl, t0.4-words-etl, t0.5-strokes-etl, t0.6-sentences-etl  
**No commits performed.**

## T0.3 worktree (/Users/harry/Documents/git/kanji-forge/.claude/worktrees/t0.3-kanji-etl)

1. `ls -la packs/kanji-v1.sqlite`  
   → 1966080 bytes (~1.97 MB, correct size, not zero).

2. sqlite3 counts + sample  
   - `SELECT COUNT(*) FROM kanji;` → **13108**  
   - `SELECT literal, grade, stroke_count, meanings FROM kanji WHERE literal = '日' LIMIT 1;` → `日|1|4|["day","sun","Japan","counter for days"]`  
   **PASS** — data is present and correct.

3. `rg -n "sources.lock|sha256|deny|qc_type" scripts/build-packs/build-kanji-pack.ts | head -40`  
   Output shows extensive checks for `sources.lock.json`, SHA256 verification on input, schema deny-list for `qc_type`/`skip`/`misclass`, binary scan for forbidden strings, and explicit assertion failures.

4. Lockfile SHA verify code exists (not just comments)  
   Confirmed in `main()`:  
   ```ts
   const inputData = fs.readFileSync(KANJIDIC_PATH);
   const actualSha = crypto.createHash('sha256').update(inputData).digest('hex');
   if (actualSha !== kLock.sha256) { ... process.exit(1); }
   ```
   **PASS** — full fail-closed verification is implemented and active.

**T0.3 Result: PASS**

## T0.4 worktree (/Users/harry/Documents/git/kanji-forge/.claude/worktrees/t0.4-words-etl)

1. `ls -la packs/words-core-v1.sqlite` → 27,009,024 bytes (~27 MB).

2. Schema & data inspection  
   - Table: `entries(id, common_score, data BLOB)` + forms + glosses_fts.  
   - `SELECT hex(substr(data,1,200)) FROM entries LIMIT 1;` → starts with `7B22...` (JSON).  
   - Python inspection: data is **JSON** with `seq`, `kanji[]`, `kana[]`, `sense[]` (misc is inside senses, not top-level). No `&uk;` or `&n;`.

3. Entity check:  
   `SELECT count(*) FROM entries WHERE data LIKE '%&uk;%' OR data LIKE '%&n;%';` → **0**  
   No HTML entities remain in the stored JSON blobs.  
   **PASS**

**T0.4 Result: PASS**

## T0.5 worktree (/Users/harry/Documents/git/kanji-forge/.claude/worktrees/t0.5-strokes-etl)

1. `ls packs/strokes` — only current scheme files:  
   - manifest.json  
   - strokes-4E00-4FFF.json ... strokes-8000-9FFF.json  
   - strokes-CJK_Extended.json  
   **Correct set only.**

2. Component tree for 本 (U+0672C / 0672c):  
   ```json
   {
     "components": {
       "element": "本",
       "children": [
         {
           "element": "木",
           "children": [
             { "element": "丨" }
           ]
         }
       ]
     }
   }
   ```
   Properly nested (木 → 丨 child). **PASS**

**T0.5 Result: PASS**

## T0.6 worktree (/Users/harry/Documents/git/kanji-forge/.claude/worktrees/t0.6-sentences-etl)

1. `ls -la packs/sentences-v1.sqlite` → 36,765,696 bytes (~37 MB, close to expected ~40 MB).

2. `.schema sentence_word_links` → Correct: `(sentence_id, jmdict_sense_id, word_start_char, word_end_char)` with proper FK and index.

3. `SELECT * FROM sentence_word_links LIMIT 5;`  
   Shows entries like:  
   `1297|一寸した:01|3|9`  
   `4702|何か:01|0|2`  
   Uses **jmdict_sense_id** (not only surface forms).

4. `SELECT jmdict_sense_id, count(*) c FROM sentence_word_links GROUP BY 1 HAVING c>5 LIMIT 5;` → **0 rows** (no over-linked senses).

5. Furigana sampling:  
   - "日本" → furigana `"にほん"` (correct reading).  
   - "食べる" in context → `"食べられる"` has empty furigana on conjugated part (correct behavior; no dictionary lemma forced on conjugation).  
   **PASS**

**T0.6 Result: PASS**

---

**Overall Verification: All blocks PASS with concrete evidence above.**

Results written to `/Users/harry/Documents/git/kanji-forge/mvp-docs/wave2-postfix-verify.md` (no commits).