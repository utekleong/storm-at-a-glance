// Core update logic. Pure: takes the current data and a fetchJson(path) function,
// returns the updated data. No Node-only APIs, so it can also run in a browser.

export const API = "https://api.videreproject.com";

// Archetype labels that count as Storm (the page renames/merges some of these).
export const STORM_RX = /storm|epic gamble|ad nauseam tendrils|necrodominance|riddlesmith/i;

const CLS = l => {
  for (const [k, c] of [["Land","La"],["Creature","Cr"],["Planeswalker","Pl"],["Instant","In"],["Sorcery","So"],["Artifact","Ar"],["Enchantment","En"]])
    if ((l || "").includes(k)) return c;
  return "Ot";
};

const addDays = (ds, n) => { const t = new Date(ds + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

const qty = (list, name) => list.filter(c => c.name === name).reduce((a, c) => a + c.quantity, 0);
const has = (list, name) => qty(list, name) > 0;

// Variant for a decklist when Videre gave no label. Mirrors the page's rules.
export function inferVariant(mb) {
  if (qty(mb, "Necrodominance") >= 3 && has(mb, "Beseech the Mirror")) return "Necrodominance Storm";
  if (has(mb, "Infernal Tutor") && has(mb, "Urza's Saga") && has(mb, "Ad Nauseam")) return "Saga Storm";
  if (has(mb, "Ad Nauseam") && has(mb, "Past in Flames") && !has(mb, "Beseech the Mirror")) return "ANT";
  if (has(mb, "Beseech the Mirror") && (has(mb, "Tendrils of Agony") || has(mb, "Ad Nauseam"))) return "Beseech Storm";
  if (has(mb, "Infernal Tutor") && (has(mb, "Tendrils of Agony") || has(mb, "Ad Nauseam"))) return "The EPIC Storm";
  if (has(mb, "Ruby Medallion") && (has(mb, "Grapeshot") || has(mb, "Empty the Warrens"))) return "Ruby Storm";
  if (has(mb, "Gamble") && has(mb, "Lion's Eye Diamond") && (has(mb, "Grapeshot") || has(mb, "Echo of Eons"))) return "The EPIC Gamble";
  return null;
}

// Is this Top 32 entry a Storm deck? Returns {variant, flag} or null.
export function stormEntry(standing, deck) {
  const label = standing.archetype || "";
  const mb = deck ? deck.mainboard || [] : [];
  if (STORM_RX.test(label)) return { variant: label, flag: 0 };
  // Player-specific rule: Killabee's Echo of Eons + Lion's Eye Diamond lists are Riddlesmith Combo.
  if (/^killabee$/i.test(standing.player) && has(mb, "Echo of Eons") && has(mb, "Lion's Eye Diamond")) return { variant: label || "Riddlesmith Combo", flag: label ? 0 : 1 };
  // Necrodominance Storm, whatever the label.
  if (qty(mb, "Necrodominance") >= 3 && has(mb, "Beseech the Mirror")) return { variant: label || "Necrodominance Storm", flag: label ? 0 : 1 };
  if (!label && mb.length) { const v = inferVariant(mb); if (v) return { variant: v, flag: 1 }; }
  return null;
}

export async function update({ data, fieldBase, fieldEvents, fetchJson, today, log = () => {}, lookbackDays = 3 }) {
  const baseCutoff = fieldBase.cutoff;                 // events on/before this date live in fieldBase
  const videreDates = data.events.filter(e => e[0] > 0).map(e => e[1]).sort();
  const lastDate = videreDates[videreDates.length - 1] || baseCutoff;
  let from = addDays(lastDate, -lookbackDays);
  if (from <= baseCutoff) from = addDays(baseCutoff, 1);
  const to = addDays(today, 1);
  if (from > to) { log("Nothing to do"); return { changed: false, data, fieldEvents }; }

  // 1. Events in the window (paginated).
  const evs = [];
  for (let offset = 0; ; ) {
    const j = await fetchJson(`/events?format=legacy&kind=challenge&min_date=${from}&max_date=${to}&limit=100&offset=${offset}`);
    evs.push(...(j.data || []));
    if (!j.meta || !j.meta.has_more) break;
    offset = j.meta.next_offset;
  }
  const challenges = evs.filter(e => /challenge/i.test(e.name) && e.date.slice(0, 10) > baseCutoff);
  log(`${challenges.length} Challenge(s) between ${from} and ${to}`);

  const cardIdx = new Map(data.cards.map((c, i) => [c[0], i]));
  const archIdx = new Map(data.arch.map((a, i) => [a, i]));
  const fieldArch = new Map(fieldBase.arch.map((a, i) => [a, String(i)]));
  const arch = a => { if (!archIdx.has(a)) { data.arch.push(a); archIdx.set(a, data.arch.length - 1); } return archIdx.get(a); };
  const card = async name => {
    if (!cardIdx.has(name)) {
      let t = "Ot";
      try { const j = await fetchJson(`/cards/named?exact=${encodeURIComponent(name)}`); const c = Array.isArray(j.data) ? j.data[0] : (j.data || j); t = CLS(c && c.type_line); } catch (_) {}
      data.cards.push([name, t]); cardIdx.set(name, data.cards.length - 1);
    }
    return cardIdx.get(name);
  };
  const pack = async list => { const m = new Map(); for (const c of list || []) m.set(c.name, (m.get(c.name) || 0) + c.quantity); const out = []; for (const [n, q] of m) out.push(q * 1000 + await card(n)); return out; };

  let changed = false;
  for (const e of challenges) {
    const d = e.date.slice(0, 10), win = `&min_date=${addDays(d, -2)}&max_date=${addDays(d, 2)}`;
    const st = ((await fetchJson(`/standings?event_id=${e.id}${win}&limit=500`)).data || []).sort((a, b) => a.rank - b.rank);
    if (st.length < 8) { log(`  ${d} ${e.name}: standings not ready, skipping`); continue; }
    const decks = (await fetchJson(`/decks?event_id=${e.id}${win}&limit=500`)).data || [];
    const deckOf = s => decks.find(x => x.id === s.deck_id) || decks.find(x => x.player === s.player) || null;

    // Replace anything we had for this event (Videre fills in lists over time).
    data.decks = data.decks.filter(x => x[0] !== e.id);
    data.events = data.events.filter(x => x[0] !== e.id);
    data.events.push([e.id, d, e.name.replace(/^Legacy /, ""), e.players, e.rounds]);

    const top = st.filter(s => s.rank <= 32), n = top.length;
    const fe = { month: d.slice(0, 7), slots: [Math.min(8, n), Math.min(16, n), Math.min(32, n)], counts: {} };
    let nStorm = 0;
    for (const s of top) {
      const deck = deckOf(s), hit = stormEntry(s, deck);
      const band = s.rank <= 8 ? 0 : s.rank <= 16 ? 1 : 2;
      const key = hit ? "S" : !s.archetype ? "U" : (fieldArch.get(s.archetype) || "O");
      (fe.counts[key] = fe.counts[key] || [0, 0, 0])[band]++;
      if (!hit) continue;
      nStorm++;
      const ms = ((await fetchJson(`/matches?format=legacy&event_id=${e.id}&player=${encodeURIComponent(s.player)}&limit=50${win}`)).data || [])
        .filter(m => m.player === s.player).sort((a, b) => a.round - b.round)
        .map(m => [m.round, m.opponent, arch(m.opponent_archetype || ""), m.result === "win" ? "W" : m.result === "loss" ? "L" : "D", String(m.record).replace(/-0$/, "")]);
      data.decks.push([e.id, s.rank, s.player, hit.variant, s.record, await pack(deck && deck.mainboard), await pack(deck && deck.sideboard), ms, hit.flag,
        hit.flag ? "Unlabelled in Videre; classified from the decklist" : ""]);
    }
    fieldEvents[e.id] = fe;
    changed = true;
    log(`  ${d} ${e.name}: ${n} in Top 32, ${nStorm} Storm`);
  }
  data.events.sort((a, b) => b[1].localeCompare(a[1]) || b[0] - a[0]);
  return { changed, data, fieldEvents };
}

// Combine the frozen monthly field counts with per-event counts added since.
export function buildField(fieldBase, fieldEvents) {
  const months = new Map(fieldBase.months.map(m => [m[0], [m[0], [...m[1]], Object.fromEntries(Object.entries(m[2]).map(([k, v]) => [k, [...v]]))]]));
  for (const fe of Object.values(fieldEvents)) {
    if (!months.has(fe.month)) months.set(fe.month, [fe.month, [0, 0, 0], {}]);
    const m = months.get(fe.month);
    fe.slots.forEach((v, i) => m[1][i] += v);
    for (const [k, v] of Object.entries(fe.counts)) { const t = m[2][k] = m[2][k] || [0, 0, 0]; v.forEach((x, i) => t[i] += x); }
  }
  return { arch: fieldBase.arch, months: [...months.values()].sort((a, b) => a[0].localeCompare(b[0])) };
}
