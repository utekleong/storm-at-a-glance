// Fetch new MTGO Legacy Challenges from the Videre Project API and add any Storm Top 32s.
// Usage: node scripts/update.mjs
import { readFile, writeFile } from "node:fs/promises";
import { API, update } from "./lib.mjs";

const root = new URL("..", import.meta.url);
const read = async f => JSON.parse(await readFile(new URL(f, root), "utf8"));
const write = (f, v) => writeFile(new URL(f, root), JSON.stringify(v) + "\n");

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchJson(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(API + path, { headers: { "user-agent": "storm-at-a-glance (GitHub Action)" } });
      if (r.ok) { await sleep(250); return await r.json(); }
      if (attempt >= 5 || (r.status < 500 && r.status !== 429 && r.status !== 400)) throw new Error(`HTTP ${r.status} for ${path}`);
    } catch (e) { if (attempt >= 5) throw e; }
    await sleep(1500 * attempt);
  }
}

const data = await read("data/storm32.json");
const fieldBase = await read("data/field_base.json");
const fieldEvents = await read("data/field_events.json");
const today = new Date().toISOString().slice(0, 10);

const res = await update({ data, fieldBase, fieldEvents, fetchJson, today, log: console.log });
if (res.changed) {
  await write("data/storm32.json", res.data);
  await write("data/field_events.json", res.fieldEvents);
  console.log(`Saved: ${res.data.events.length} events, ${res.data.decks.length} Storm decks`);
} else console.log("No changes");
