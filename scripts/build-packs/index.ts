/**
 * Not the pipeline entry point — nothing in this repo imports this file.
 *
 * The ETL pipeline is implemented across the sibling `build-*.ts` scripts (one per pack) and
 * orchestrated/verified by `pipeline.mjs`. See scripts/build-packs/README.md for the map, or
 * run `pnpm packs:verify` / `pnpm packs:refresh` directly.
 */
export {}
