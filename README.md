# Mission 3 — Pricing & Cost Laboratory

A static, browser-only financial modeling lab for the two venture contexts present in the supplied materials: the Google Nara Tee website concept and the Quick-Fold Laundry Sorting Mat researched in Mission 1. The context selector preserves that mismatch and prevents the unmatched folding-board dataset from being treated as apparel evidence.

## Run locally

Requires Node.js 22+ for validation/build. The published app has no runtime dependencies.

```sh
npm test
npm run build
python3 -m http.server 8766 -d dist
```

Open `http://localhost:8766/`. Edits persist in browser local storage. Export a JSON backup before switching devices or clearing browser data.

## Modeling notes

- Research references, illustrative values, and student inputs are separately labeled in the interface.
- Subscription revenue and recurring costs normalize to monthly equivalents. Startup cash is reported separately; depreciation only enters break-even when specified.
- Shared costs count once in business profit. Product views allocate overhead by revenue share.
- Risk labels are deterministic screens, not failure probabilities or demand forecasts.
- The app never confirms a pricing decision automatically. Report exports require a current student evaluation and confirmation.
