# Statistics Section Audit — 2026-07-13

Scope: `Client/src/features/statistics/`, `Client/src/shared/stats/`, `periodontogram/statistics-panel.jsx`, `main-page/components/patient-stats.jsx`, `Server/controllers/statsController.js`, `Server/routes/statsRoutes.js`, related tests.

First audit run — no previous report to compare against.

---

## CRITICAL

### C1. Home widget renders an empty chart for "Ingresos Totales" (the default metric)
**File:** `Client/src/features/main-page/components/patient-stats.jsx:96-100`
`||` binds tighter than `?:`, so the condition is `(chartData.datasets || chartData.revenue?.datasets)`. The `/stats/summary` response has `revenue.data`, not `revenue.datasets`, so the condition is falsy and `rawDatasets = []` — the inner fallback that builds `[{ label: 'Ingresos', data: chartData.revenue.data }]` is unreachable. Labels render (they come from `chartData.revenue?.labels`) but no bars. This is the default selected stat on the Home page.
**Fix:**
```js
const rawDatasets = chartData.datasets
  || (chartData.revenue ? [{ label: 'Ingresos', data: chartData.revenue.data }] : []);
```

---

## HIGH

### H1. Week labels use calendar year, Mongo groups drop data at year boundaries
**File:** `Server/controllers/statsController.js:11` (`week: '%Y-W%V'`) vs `isoWeekString` (line 64).
Mongo `%V` is the ISO week number but `%Y` is the *calendar* year; the JS helper `isoWeekString` correctly uses the ISO week-year. Around Dec 29–Jan 3 these disagree (e.g. 2027-01-01 → Mongo `"2027-W53"`, JS `"2026-W53"`). Since charts are built by mapping `buildPeriodLabels` output over the Mongo result map, mismatched keys silently become 0 — revenue/appointments near year boundaries vanish from every weekly chart.
**Fix:** change the format to `'%G-W%V'` (`%G` = ISO week-year, supported by MongoDB).

### H2. Timezone mismatch: Mongo groups in UTC, labels built in server-local time
**File:** `Server/controllers/statsController.js` — all endpoints (`buildDateGroup`, `parseDateRange`, `buildPeriodLabels`).
`$dateToString` defaults to UTC; `buildPeriodLabels`/`parseDateRange` use local time (`getFullYear`, `setHours(23,59,59,999)`). On any non-UTC server: (a) movements near midnight land in the adjacent day bucket, (b) for `day` granularity the first/last label can miss the Mongo group key entirely, zeroing that day. Same class of silent data loss as H1.
**Fix:** pass an explicit `timezone` to `$dateToString` and build labels/range boundaries in that same timezone (or do everything in UTC).

### H3. `buildPeriodLabels` can omit the final (current) week — off-by-one
**File:** `Server/controllers/statsController.js:93-95`.
Week stepping starts at `start` and jumps +7 days. If `from`/`to` are supplied with different weekdays (e.g. start Wednesday, end the following Monday), the cursor jumps past `stop` before entering its ISO week, so the last partial week label is never emitted — appointments/income of the current week disappear from weekly charts. Defaults happen to work only because the default window makes start/end share a weekday.
**Fix:** snap the cursor to the Monday of `start`'s ISO week before iterating.

### H4. "Citas atendidas" in productivity counts appointments that weren't attended
**File:** `Server/controllers/statsController.js:467`.
`estado: { $in: ['Confirmada', 'Pasada'] }` — but per the codebase's own comment (line 309-311), `'Pasada'` is auto-assigned to *every* past unclosed appointment, attended or not; and `'Confirmada'` includes future appointments inside the range that haven't happened yet. The metric overstates attendance and is internally inconsistent with `getNoShows`. Also this endpoint is the only trend endpoint that does **not** use `buildPeriodLabels` — empty periods are skipped, so its x-axis differs from every other chart.
**Fix:** define an explicit attended state (or exclude future dates: `fecha_hora: { $lte: now }`), and fill labels with `buildPeriodLabels` like the other endpoints.

---

## MEDIUM

### M1. Home widget and Statistics page use different date ranges despite claiming parity
**Files:** `patient-stats.jsx:7-9, 55-57` vs `statsService.js:33-35`.
The Home widget comment says it hits "the SAME endpoints … so the numbers match", but it sends `from=Jan 1, to=now, group=month` (YTD) while StatisticsPage sends only `group` — the backend then applies default windows (last 30 d / 12 w / 12 m / 5 y). The same metric shows different numbers on the two views.
**Fix:** send the same range from both, or centralize range building in `statsService`.

### M2. `/stats/summary` allows `stats.read.own` but returns clinic-wide data
**Files:** `Server/routes/statsRoutes.js:9`, `statsController.js:114-168`.
Every other stats route requires `stats.read.admin`. Summary accepts `stats.read.own` yet the controller has no per-user filtering — a user with only "own" scope sees global revenue, patient and appointment totals.
**Fix:** either restrict to `stats.read.admin` or filter by the requesting professional when scope is `own`.

### M3. Mislabeled legacy faces are silently dropped in the shared core
**File:** `Client/src/shared/stats/periodontal-stats-core.cjs:72-74, 155-158`.
The legacy map sends an inferior tooth's `palatino` block to `palatinoSuperior` (and a superior tooth's `lingual` to `lingualInferior`), but `facesForTooth` then filters to the tooth's own arcada — so those measurements are counted for neither face. If the intent is "palatino on a lower tooth means lingual", map it to the arcada's own face; if the intent is to discard, do it explicitly.
**Fix:** map legacy `palatino`→`lingualInferior` for inferior teeth and `lingual`→`palatinoSuperior` for superior teeth (or document the drop). Add a fixture either way.

### M4. Client/server `calculateStatistics` output shapes diverge
**Files:** `Server/utils/UniversalToothValidator.js:697-710` vs `Client/src/shared/validators/universal-tooth-validator.js:264-276`.
Server includes `bleedingCount`/`plaqueCount` but not `maxProbingDepth`; client includes `maxProbingDepth` but not the raw counts. The shared core guarantees identical accumulators, but the shaped payloads consumers actually see differ, which is why `statistics-panel.jsx` needs `normalizeStatistics`. Rounding rules match (good).
**Fix:** emit the same field set from both wrappers; then delete `normalizeStatistics`.

### M5. `getInactivePatients`: 8 queries + in-memory diff, ignores soft-deleted patients
**File:** `Server/controllers/statsController.js:610-645`.
Two `distinct` calls per threshold (×4) pulling full ID arrays into memory, then set-difference in JS — O(patients) memory, and thresholds are computed independently so the work is repeated 4×. It also never checks `Patient.deletedAt`, so soft-deleted patients with old appointments are counted as "inactive".
**Fix:** one aggregation grouping appointments by `paciente_id` with `max(fecha_hora)`, `$lookup` (or pre-filter) on non-deleted patients, then bucket the 4 thresholds from that single result.

### M6. `getTreatmentDuration` excludes 0-day treatments and measures from the wrong anchor
**File:** `Server/controllers/statsController.js:702`.
`duracionDias: { $gt: 0 }` drops same-day completions entirely, biasing the average upward (a treatment created and finished the same day is legitimate, duration 0). The start anchor is the *document's* `createdAt`, not the individual treatment item's start date (acknowledged in the comment) — for long-lived treatment-plan documents every later item inherits an inflated duration.
**Fix:** use `$gte: 0`; anchor on the item's own start date if one exists.

### M7. `statistics-panel.jsx` recomputation machinery is unstable and partly self-defeating
**File:** `Client/src/features/periodontogram/statistics-panel.jsx:21-74, 177-235`.
`dataKey` includes `data.lastModified || data.updatedAt || Date.now()` — with no timestamp field the key changes on every recompute, making the hash worthless. `forceUpdate` (debounced 150 ms) plus `sampleDataVersion` plus `dataKey` are three overlapping invalidation mechanisms for one memo; the validator already has its own hash-based cache underneath. Also the "if computed stats are all zero, fall back to pre-calculated" logic (line 194) masks genuinely-empty charts and can show stale numbers.
**Fix:** depend the memo on `data` alone (or a single stable hash); remove `forceUpdate`; make the zero-fallback explicit (only when `teeth` is empty).

### M8. `heatmap` visualization is advertised but renders as a bar chart
**Files:** `StatisticsPage.jsx:21` (cashbox-performance offers `heatmap`), `statsService.js:14` (`heatmap: 'bar'`).
The UI chip promises a heatmap; users get an identical bar chart. Either implement it or remove the option.

---

## LOW

### L1. `getSummary` `patients.total` is "new patients in range", not total patients
**File:** `statsController.js:136`. Counts `createdAt` within range but the field is named/consumed as a total. Currently unused by both frontends — rename (`newPatients`) or drop it.

### L2. `getNetEarnings` treats any non-INCOME type as expense
**File:** `statsController.js:539-540`. Safe today (enum is `INCOME|EXPENSE`) but a future type silently lands in "Gastos". Match `EXPENSE` explicitly.

### L3. Dead CSS from the v1 tab layout
**File:** `Client/src/features/statistics/styles/statistics-page.css`. `.statistics-tabs`, `.statistics-tab`, `.statistics-tab--active`, `.metrics-panel__instructions` are referenced nowhere in JSX (layout moved to the v2 flat-slot model per the `LOCAL_STORAGE_KEY` comment). Delete them. `statistics-panel.css` has no unused classes.

### L4. Inline styles in `statistics-panel.jsx`
Lines 269-299: the sample-data banner and button are styled inline while a dedicated stylesheet exists; also the banner text says "96 sitios (32×3)" while the sample-data comment (line 79) reasons about "72 sitios" — one of the two is stale (32 teeth × 3 sites = 96 only if counting one face; the core uses 2 faces × 3 = 6/tooth → 192 max, denominator is `teethWithClinicalData * 6`). Align the copy with the actual formula.

### L5. `ChartRenderer` destroys and recreates the chart on every prop change
**File:** `ChartRenderer.jsx:80-103`. `chart.update()` with mutated `data` is cheaper and animates smoothly; `buildOptions` also re-reads `getComputedStyle` on each rebuild. Minor — charts are small. Same pattern in `patient-stats.jsx`.

### L6. Repeated map-fill boilerplate in `statsController.js`
The "aggregate → build map → `labels.map(l => map[l] || 0)`" pattern appears 8×. A 10-line helper (`fillSeries(rows, labels, keyFn, valFn)`) would remove ~80 lines and make H1/H3 fixable in one place.

### L7. Duplicated palettes
`statsService.js:19-31` and `patient-stats.jsx:19-24` hold the same palette (acknowledged by comment). Export it once from a shared module.

---

## Positive observations

- `parseDateRange` handles invalid `from`/`to` gracefully; `MAX_POINTS = 1825` caps label generation; every controller has try/catch with 500 + logged error.
- `StatisticsPage` request-ID guard correctly discards stale responses; `patient-stats` uses AbortController for the same race.
- The shared `periodontal-stats-core.cjs` design (raw accumulators, single source of truth, cross-runtime fixtures) is sound; the [0,0,0]-unmeasured, 999-sentinel and signed-margin NIC conventions are consistently applied and fixture-covered.
- `getNoShows` correctly excludes `'Pasada'` from no-show counts with a clear rationale comment.

## Test coverage gaps

1. **`statsController` has zero tests.** None of the 11 endpoints are covered — no test would catch C1's contract, H1, H2, H3 or H4. Priority: unit-test `buildPeriodLabels` + `isoWeekString` (year-boundary and partial-week cases) and one supertest per endpoint against an in-memory Mongo (the repo already uses mongodb-memory-server).
2. **`gingival-margin-statistics.script.js` and `statistics-consistency.script.js` are console scripts, not tests** — they log ✅/❌ but never `expect()` or set an exit code, so CI can't fail on them. Convert to Jest (their manual-calculation cases are good fixtures already).
3. **Wrapper shaping is untested.** The cross-runtime tests cover only raw accumulators; percentages, rounding (`Math.round` vs 2-decimal), division-by-zero guards and the client/server shape divergence (M4) have no coverage.
4. **Missing fixtures:** legacy `palatino` on an inferior tooth / `lingual` on a superior tooth (M3), bleeding/plaque as booleans (`true`) vs numbers, `999` in bleeding arrays, teeth keyed as strings vs numbers.
5. **Frontend:** no tests for `statsService` response mapping (would have caught C1 if the same pattern were shared) or `StatisticsPage` localStorage sanitization (`sanitizeStoredState` handles malformed input well but nothing verifies it).

---

*Generated by scheduled audit `dentiacore-statistics-audit`. Notes: severity reflects user-visible impact; C1/H1–H3 all manifest as silently missing chart data rather than errors, which is why they've gone unnoticed.*
