// Build the static site: inject the data into the page template and write dist/index.html.
// Usage: node scripts/build.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildField } from "./lib.mjs";

const root = new URL("..", import.meta.url);
const read = f => readFile(new URL(f, root), "utf8");

const data = JSON.parse(await read("data/storm32.json"));
const field = buildField(JSON.parse(await read("data/field_base.json")), JSON.parse(await read("data/field_events.json")));
const dates = data.events.map(e => e[1]).sort();
const meta = { generated: new Date().toISOString(), window: [dates[0], dates[dates.length - 1]], rx: "storm" };

let html = await read("site/template.html");
html = html.replace(/const META = \{[^\n]*\};/, `const META = ${JSON.stringify(meta)};`);
html = html.replace("__DATA__", () => JSON.stringify(data)).replace("__FIELD__", () => JSON.stringify(field));
if (html.includes("__DATA__") || html.includes("__FIELD__")) throw new Error("Template placeholders not replaced");

await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/index.html", root), html);
await writeFile(new URL("dist/.nojekyll", root), "");
console.log(`Built dist/index.html: ${data.events.length} events, ${data.decks.length} Storm decks, data to ${meta.window[1]}`);
