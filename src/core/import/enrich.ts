export type ImportEntryKind = 'kanji' | 'word' | 'name' | 'unknown'

export interface ImportEntry {
  readonly label: string
  readonly contentRef: string | null
  readonly kind: ImportEntryKind
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
  return entries.filter((entry) => {
    const key = entry.contentRef ?? `unknown:${entry.label.normalize('NFC')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
