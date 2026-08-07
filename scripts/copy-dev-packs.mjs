// packs-dev/ lives at the repo root (so pipeline scripts can write it directly), but the static
// Next export only serves files under public/. Mirror it into public/packs-dev/ so the client can
// fetch decks.json and the pack sqlite files at runtime without a network download.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const source = path.join(root, 'packs-dev');
const destination = path.join(root, 'public', 'packs-dev');

if (!existsSync(source)) {
  throw new Error(`Expected packs-dev/ at ${source}.`);
}

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.info('Mirrored packs-dev/ into public/packs-dev/');
