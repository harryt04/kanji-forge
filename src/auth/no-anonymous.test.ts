import { describe, expect, it } from 'vitest';
import { openLocalUserDatabase } from '@/data/db';
import { startOutboxFlusher } from '@/data/outbox';
import { startShapeSubscription } from '@/data/sync';

describe('no-anonymous production boundary', () => {
  it.each([openLocalUserDatabase, startOutboxFlusher, startShapeSubscription])(
    'rejects an empty user id at every user-data entry point',
    (entryPoint) => expect(() => entryPoint('')).toThrow(),
  );
});
