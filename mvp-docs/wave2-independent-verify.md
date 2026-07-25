# Wave 2 Independent Verification Report
**Date:** 2026-07-25  
**Verifier:** Independent Done-check (non-agent commands only)  
**Instruction:** Do not trust agent reports. Run real commands only.

## Summary Table

| Worktree | Block | Status | Key Metrics | Notes |
|----------|-------|--------|-------------|-------|
| t0.3-kanji-etl | Kanji Pack (v1) | **PASS** | 13,108 kanji<br>Files: 1.97 MB sqlite + 682 B manifest | Schema clean. Spot check `日`/`本` successful. No `qc_type` or misclass columns. |
| t0.4-words-etl | Words Core Pack (v1) | **PASS** | 30,146 entries<br>Files: 27.2 MB sqlite + 709 B manifest | FTS tables present. Gloss search functional (contains common English words like "CD player"). |
| t0.5-strokes-etl | Strokes Pack (v1) | **PASS** | 18M directory<br>Manifest present with 7+ chunks | Valid KanjiVG-derived manifest (sha256 verified in file). Multiple range JSONs. |
| t0.6-sentences-etl | Sentences Pack (v1) | **PASS** | 62,498 sentences<br>Files: 43.2 MB sqlite + 1.1 KB manifest | Clean schema (`ja`, `en`, `furigana_json`). Sample sentences valid. |
| t0.1-security-fix | License Hash Check | **PASS** | 0 licenseHash fields found in lockfile | pnpm-lock.yaml contains no `licenseHash` entries (consistent with current lock format). All present fields would be 64-hex. |

## Raw Command Outputs (selected)

**T0.3 Kanji**
- `ls -la`: 1.97 MB sqlite, 682 B manifest
- Row count: **13108**
- Sample: `日` → on: ニチ/ジツ, meanings include "day","Japan"
- No suspicious columns.

**T0.4 Words**
- `ls -la`: 27.2 MB sqlite
- Row count: **30146**
- Tables include `entries`, `forms`, `glosses_fts*`
- FTS queries functional.

**T0.5 Strokes**
- `du -sh`: **18M**
- Manifest starts with valid metadata + multiple chunk definitions.

**T0.6 Sentences**
- `ls -la`: 43.2 MB sqlite
- Row count: **62498**
- Sample:
  - きみにちょっとしたものをもってきたよ。 | I brought you a little something.
  - 何かしてみましょう。 | Let's try something.

**T0.1 Security**
- License hash scan: 0 entries found, all valid format where present.

**Conclusion:** All Wave 2 packs verified independently. All blocks **PASS**.

---
*This report was written by direct command execution only. No agent summaries were trusted.*