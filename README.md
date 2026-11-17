# Storm at a glance

Storm results from MTGO Legacy Challenges, tracked weekly. A static site built from [Videre Project](https://videreproject.com) data, cross-checked against the Legacy Data Collection Project.

## How it works

- `data/storm32.json`: every Storm Top 32 finish (events, decklists, match paths).
- `data/field_base.json`: monthly Top 32 field counts up to `cutoff`; `data/field_events.json`: per-Challenge field counts added after that.
- `site/template.html`: the page. `__DATA__` and `__FIELD__` are filled in at build time.
- `scripts/update.mjs`: fetches new Challenges from the Videre API and adds any Storm Top 32s. It re-checks the last 3 days each run, so decklists Videre publishes late are picked up.
- `scripts/build.mjs`: writes `dist/index.html`.

The GitHub Action in `.github/workflows/update.yml` runs every 2 hours (and on demand from the Actions tab). It updates the data, commits it, builds the page and deploys it to GitHub Pages. A push to `main` rebuilds and redeploys without fetching.

Run locally with Node 20+:

```sh
node scripts/update.mjs   # fetch new Challenges
node scripts/build.mjs    # build dist/index.html
```

## What counts as Storm

- Videre archetypes containing "storm", plus The EPIC Gamble, ANT, Necrodominance and Riddlesmith Combo.
- Unlabelled lists are classified from the decklist (shown as *inferred*).
- Necrodominance Storm: 3+ Necrodominance and Beseech the Mirror, whatever the label.
- Riddlesmith Combo: Videre's label, plus any Killabee list with Echo of Eons and Lion's Eye Diamond.
- The page also reclassifies EPIC/Beseech lists with Infernal Tutor + Urza's Saga + Ad Nauseam as Saga Storm, and Ad Nauseam + Past in Flames without Beseech the Mirror as ANT.

Results from Challenges missing in Videre were added by hand from the Legacy Data Collection Project and are not updated automatically.
