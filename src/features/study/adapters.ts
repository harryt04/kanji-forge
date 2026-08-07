/**
 * `data/repo` persists `CardState`/`Review` keyed by `contentRef` (matching the SQL column);
 * `core/srs` operates on the same shape keyed by `stickyId` (the pure engine's vocabulary). These
 * two functions are the one place that translates between them.
 */
import type { CardState as CoreCardState } from '@/core/srs/types';
import type { CardState as RepoCardState } from '@/data/repo';

export function toCoreState(state: RepoCardState): CoreCardState {
  const { contentRef, ...rest } = state;
  return { ...rest, stickyId: contentRef };
}

export function toRepoState(state: CoreCardState): RepoCardState {
  const { stickyId, ...rest } = state;
  return { ...rest, contentRef: stickyId };
}
