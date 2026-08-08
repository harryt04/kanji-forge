export type ImportEntryKind = 'kanji' | 'word' | 'name' | 'unknown'

export interface ImportEntry {
  readonly label: string
  readonly contentRef: string | null
  readonly kind: ImportEntryKind
  readonly tags?: readonly string[]
}

export type ImportPreviewStatus = 'matched' | 'already-in-target' | 'not-found'

export interface ImportPreviewItem extends ImportEntry {
  readonly status: ImportPreviewStatus
}

/** Classifies resolved and unresolved entries without changing local state. */
export function previewImport(
  entries: readonly ImportEntry[],
  existingContentRefs: ReadonlySet<string>,
): readonly ImportPreviewItem[] {
  return entries.map((entry) => ({
    ...entry,
    status:
      entry.contentRef === null
        ? 'not-found'
        : existingContentRefs.has(entry.contentRef)
          ? 'already-in-target'
          : 'matched',
  }))
}

/**
 * Deduplicates entries by content identity while retaining unresolved values
 * independently. Repeated pasted input therefore produces one preview row.
 */
export function deduplicateImportEntries(
  entries: readonly ImportEntry[],
): readonly ImportEntry[] {
  const seen = new Set<string>()
  const deduplicated: ImportEntry[] = []
  for (const entry of entries) {
    const key = entry.contentRef ?? `unknown:${entry.label.normalize('NFC')}`
    if (seen.has(key)) {
      if (entry.tags && entry.tags.length > 0) {
        const index = deduplicated.findIndex(
          (candidate) =>
            (candidate.contentRef ??
              `unknown:${candidate.label.normalize('NFC')}`) === key,
        )
        const previous = deduplicated[index]
        if (previous) {
          const tags = [...new Set([...(previous.tags ?? []), ...entry.tags])]
          deduplicated[index] = { ...previous, tags }
        }
      }
      continue
    }
    seen.add(key)
    deduplicated.push(entry)
  }
  return deduplicated
}
