import { afterEach, describe, expect, it } from 'vitest';
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db';
import { createUserRepositories, type CardState, type Review } from '.';

const databases: LocalUserDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function state(): CardState {
  return { deckId: 'jlpt-n5', contentRef: 'kanji:未', level: 1, dueAt: 1_700_000_000_000, lastReviewedAt: 1_699_999_000_000, correctStreak: 1, totalReviews: 1, totalCorrect: 1, lapses: 0, flagged: false, manualOverride: false, updatedAt: 1_699_999_000_000, updatedBy: 'device-a' };
}
function review(): Review {
  return { id: '018f0010-0000-7000-8000-000000000001', deckId: 'jlpt-n5', contentRef: 'kanji:未', at: 1_699_999_000_000, grade: 'good', levelBefore: 0, levelAfter: 1, intervalBefore: 0, elapsedDays: 0, responseMs: 700, source: 'study', deviceId: 'device-a' };
}

describe('derived deck state projection', () => {
  it('has no per-card rows before a grade and creates exactly one on first grade', async () => {
    const database = openLocalUserDatabase('learner-1');
    databases.push(database);
    await database.ready;
    const repos = createUserRepositories(database);
    await repos.decks.upsert({ id: 'jlpt-n5', name: 'JLPT N5', kind: 'derived', definitionId: 'jlpt-kanji-n5', updatedAt: 1 });

    const source = { contentRefsFor: () => ['kanji:未', 'kanji:日'] };
    expect(await repos.cardStates.count('jlpt-n5')).toBe(0);
    expect((await repos.decks.listCards('jlpt-n5', source)).map((card) => card.state)).toEqual([undefined, undefined]);

    const nextState = state();
    const firstReview = review();
    await repos.recordGrade({ review: firstReview, nextState, day: '2023-11-14', mutation: { id: firstReview.id, mutType: 'review.append', payload: JSON.stringify(firstReview), createdAt: firstReview.at, attempts: 0 } });

    expect(await repos.cardStates.count('jlpt-n5')).toBe(1);
    expect(await repos.cardStates.get('jlpt-n5', 'kanji:未')).toEqual(nextState);
    expect((await repos.decks.listCards('jlpt-n5', source)).filter((card) => card.state !== undefined)).toHaveLength(1);
  });
});
