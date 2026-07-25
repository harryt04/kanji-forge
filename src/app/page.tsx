import React from 'react';

export default function Home(): React.ReactElement {
  return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">KanjiForge</h1>
        <p className="text-lg text-muted-foreground">
          A free, offline-first way to study kanji — the StickyStudy mechanic, open and yours.
        </p>
      </div>
    </main>
  );
}
