# Moment Meter — Developer Guide

A complete tour of how this app is built, for anyone picking it up later. Read the
[README](README.md) first for the user-facing feature list; this document explains the
internals: the data model, every subsystem, the sync engine in depth, the widgets, the
tests, and the gotchas.

---

## 1. What it is, in one paragraph

Moment Meter is a personal time-tracker (a re-implementation of the iOS "Timelines" app)
built as a **single-file progressive web app**. All logic, markup, and styling live in
`index.html`. There is no build step, no framework, no dependencies — it's plain HTML/CSS
and vanilla JavaScript in one `<script>`. Data lives entirely on-device in `localStorage`.
Optional cross-device sync uses a **private GitHub Gist** as a tiny "database" (no server
of our own). Two companion **Scriptable** scripts render iOS Home Screen widgets from the
same Gist.

Design goals, in priority order: (1) the user's data is sacred — never lose or corrupt it;
(2) works offline and installs like a native app; (3) no backend to run or pay for;
(4) native-feeling, cohesive dark UI.

---

## 2. Files

| File | What it is |
|------|-----------|
| `index.html` | **The entire app** — HTML + CSS + JS in one file (~2,700 lines). |
| `sw.js` | Service worker (offline caching + update strategy). |
| `manifest.json` | PWA manifest (name, icons, standalone display). |
| `app_icons/icon-180.png`, `app_icons/icon-512.png` | App icons (generated color-wheel design). |
| `widget_scripts/moment-meter-chart-widget.js` | Scriptable script: donut/overview Home Screen widget. |
| `widget_scripts/moment-meter-now-widget.js` | Scriptable script: current-activity square widget. |
| `readme/README.md` | User-facing setup + feature guide. |
| `readme/DEVELOPER.md` | This file. |
| `Pre-existing Data/`, `Categories/`, `Existing Reference/` | Original source material the category defaults were derived from (real CSV exports + Timelines screenshots); also useful as CSV-import test inputs. Not shipped, and no longer seeded as history. |
| `Reference/MM_Version_T/` | **Screenshots of the current app**, organized by screen (`01_Track`, `02_Log`, `03_Stats/{Day,Week,Month}`, `04_Goals`, `05_Setting`). Ground truth for how each view is meant to look. Not shipped. |

**Folder layout matters for the running app.** `index.html`, `manifest.json`, `sw.js` and
the icons reference each other by relative path, so those four (plus the icon folder) must be
deployed together at the site root. The icons live in `app_icons/`, referenced as
`app_icons/icon-180.png` etc. in the manifest `icons.src`, the `apple-touch-icon` link in
`index.html`, and the `ASSETS` list in `sw.js`; **if you move or rename that folder, update
all three.** (Underscore, no space, so no URL-encoding needed.) The `widget_scripts/` folder
and the `readme/` docs are not referenced by the app and can live anywhere (widget scripts
are pasted into Scriptable by hand).

Everything in `index.html` is organized top-to-bottom as: `<style>` → header/nav markup →
one big `<script>`. Inside the script the rough order is: constants & seed data → state
load/save → formatting helpers → totals math → timers/live-activity → view renderers
(track, log, stats, goals, settings) → export/import → **sync engine** → sheets & dialogs →
navigation & boot.

---

## 3. Running, deploying, versioning

There is no compile step. To run locally, open `index.html` in a browser (sync and the
service worker need `https://` or `localhost`; everything else works from `file://`).

**Deploying:** the app is hosted as static files on GitHub Pages
(`https://umartinezcode.github.io/moment-meter/`). To ship a change, upload the changed
files to the repo. **Always bump two version markers together** so devices actually pick up
the new code:

- `const APP_BUILD` near the top of the script (shown in Settings, so users can confirm
  which build is live). Format: `"build YYYY-MM-DD<letter> (short-note)"`.
- `const CACHE` in `sw.js` (e.g. `momentmeter-v17` → `v18`). Changing this string is what
  forces the service worker to drop the old cache and fetch fresh files.

**Deploy gotcha:** installed PWAs cache aggressively. After uploading, a device may keep
running the old build until: the GitHub Pages CDN propagates (a few minutes), the new
service worker activates (it uses `skipWaiting` + `clients.claim` and deletes old caches on
activate), and the user fully quits and reopens the app. The Settings build tag is the
ground-truth check. Worst case: delete and re-add the Home Screen icon.

---

## 4. The data model — the `S` object

All state is a single object `S`, persisted as JSON under `localStorage["momentmeter_v1"]`
(`LS_KEY`). Its shape:

```js
S = {
  categories: [ { id, name, color, archived, family, prevNames, mod } , … ],
  events:     [ { id, catId, name, start, end, notes, mod } , … ],
  goals:      [ { id, catId?, fam?, period, target } , … ], // catId OR fam (family goal)
  timers:     [ { catId, start } , … ],          // currently-RUNNING timers (usually 0 or 1)
  deleted:     [ eventOrGoalId, … ],             // tombstones: ids deleted (for sync)
  deletedCats: [ "categoryname", … ],            // tombstones: category names deleted
  deletedKeys: [ "name|start|end", "catId|start|end", … ], // content tombstones (see §12)
  settings: {
    theme: "auto"|"light"|"dark",
    switchMode: true,          // one activity at a time (default on)
    colorTheme: "v12",         // migration marker (see §8)
    families: [ { name, color }, … ],   // editable family registry (ordered)
    lastBackup: <ms> | null,
    sync: { token, gistId, lastSync, lastError, etag, pushedSig } | undefined
  }
}
```

**Field notes:**

- **`id`** — random string from `uid()`. Generated per-device, so the *same* logical
  category/event has *different* ids on different devices until sync unifies them (see §11).
- **`catId`** on events/timers/goals references a category `id`.
- **`start`/`end`** — epoch milliseconds. A running timer has only `start` (in `S.timers`);
  it becomes an event with `end` when stopped.
- **`mod`** — "last modified" epoch ms, set on every edit. Sync resolves conflicts by
  newest `mod` wins. Absent `mod` is treated as 0.
- **`prevNames`** — every previous lowercased name a category has had. This is how a rename
  propagates across devices even when ids never unified (see §11).
- **`family`** — the family a category belongs to (a string name into `settings.families`).
- **`deletedKeys`** — content-based tombstones so a deletion survives id differences and
  category renames (see §12).

`makeSeed()` builds a **fresh install: the default categories and families only — no events
or goals.** There is no bundled history; a brand-new device (before sync is connected) shows
an empty Log/Stats until you track something or connect sync, which merges your real data in
from the gist. The category defaults live in `SEED_CATS` (with `CAT_FAMILY` / `FAMILY_ORDER`
/ `DISPLAY_ORDER` for family membership and ordering). `load()` reads storage, runs
migrations, and falls back to `makeSeed()` on first run or corruption. `save()` writes storage
and (if sync is on) schedules a debounced push.

> Historical note: earlier builds seeded five days of real July history from a hard-coded
> `SEED_DAYS` table plus a "Reset to pre-loaded data" button. Both were removed — every device
> now starts the same way (default categories, no history). The duration-layout helpers
> `layoutDay()` / `hms()` remain, but only CSV import uses them now.

---

## 5. Storage & persistence

- `save()` = `localStorage.setItem(LS_KEY, JSON.stringify(S))` + a debounced sync push
  (unless `window.__inSync` is set, to avoid a sync's own save re-triggering a sync).
- `load()` handles: missing data (→ seed), invalid JSON (→ preserves the broken blob under
  `LS_KEY+"_corrupt"`, then reseeds), and old-version datasets (→ migrations).
- **Migrations** run inside `load()`, gated on `settings.colorTheme` (a version string).
  Each migration is idempotent and additive: re-color known categories, add new default
  categories/families, unify to the current color/family scheme, fold retired categories via
  `CAT_ALIAS`. `ensureFamilies()` guarantees every category has a `family` and the registry
  exists. **When you change the seed/defaults, bump the `colorTheme` marker and add a
  migration branch** rather than mutating users' existing data.

---

## 6. App structure: views, rendering, navigation

The UI is five "views" (`#view-track`, `#view-log`, `#view-stats`, `#view-goals`,
`#view-settings`), only one visible at a time. A fixed bottom tab bar switches between them.

- `switchView(name)` toggles the `.on` class, updates the title, shows/hides the header
  `＋` button, resets scroll (before the swap, to avoid an iOS sticky-header glitch), and
  calls the matching renderer from the `RENDER` map.
- Each `renderX()` function rebuilds its view's `innerHTML` from `S` and re-attaches event
  listeners. There is no virtual DOM — every render is a full string rebuild for that view.
  This is fine at this data scale and keeps the code obvious.
- `renderAll()` = re-render the current view + `updateLiveBar()`. Call it after any mutation
  that could affect the visible view (also called after every sync merge and cross-tab
  `storage` event).
- A single `setInterval(…, 1000)` "tick" updates every element with a `data-elapsed`
  attribute (running-timer clocks in the track cards, the header live bar, the log's
  in-progress rows) and the today-total, and sets the document title to the running activity.

**The Track view** (`renderTrack`) is: the **"Tracked Today" hero card** (a dark
accent-tinted card — cohesive with the tiles — showing today's total, a segmented
category-color mix bar, and a small top-3 legend; the total ticks live), then the category
tiles **grouped by family** under colored headers (see §8), then the "New category" button.

**The Settings view** (`renderSettings`) is a stack of grouped `.slist` cards of `.srow`
rows with colored icon tiles, secondary `.sub` subtitles, and `›` chevrons on navigable
rows. On/off options (Switch mode) use an iOS-style `.tgl` toggle. It also surfaces sync
status/actions, data export/import (PDF report, CSV, JSON backup/restore, CSV import),
archived-category restore, Shortcuts help, and the danger zone (now just "Erase all data" —
the "Reset to pre-loaded data" row was removed with the seed history), ending in a footer with
the `APP_BUILD` tag. (The old "Lock Screen live timer" toggle was also removed — see §7.)

---

## 7. Timers & tracking

`S.timers` holds currently-running timers. Core functions:

- `startTimer(catId)` — if **switch mode** is on (default), stops every other running timer
  first (so only one runs at a time); pushes `{catId, start:now}`; starts the live activity;
  `syncSoon()` pushes to the cloud within ~1.5s (so widgets/other device see it fast).
- `stopTimer(catId, silent)` — removes the timer; **if it ran ≥ 30 seconds**, creates a
  completed event (`start`→`now`); under 30s it's discarded (mis-tap guard). Updates live
  state; `syncSoon()`.
- `toggleTimer`, `stopAllTimers` — convenience wrappers.

**Two invariants every change must preserve** (there are tests for both — see §18):
1. **Switch mode**: starting a category stops+logs the previous one; only one timer runs.
2. **30-second rule**: a sub-30s session is discarded, not logged.

### Live activity — the header live bar

`updateLiveBar()` renders a persistent bar in the sticky header, visible on every tab while
tracking. It shows the running category, a live-ticking clock (via a `data-elapsed` element
updated by the 1s tick), and a stop button; tapping the bar opens the start-time editor.
Pure DOM, no OS involvement — this is the reliable, real-time "am I tracking" indicator.

(Historical note: an earlier build also had a *Lock-Screen media-session* "live timer" — a
silent-`<audio>` + `navigator.mediaSession` hack to reach the iOS Lock Screen. It was
flaky by nature and was **removed**; there is no `settings.liveActivity` anymore. If a
Lock-Screen presence is ever wanted again, the reliable route is a Scriptable Lock-Screen
accessory widget, not the media-session hack.)

---

## 8. Categories & families

- Categories are user-editable via `openCatSheet()` (name, color from `SWATCHES`, family,
  archive, delete). Colors come from a cohesive 32-swatch palette organized by hue×shade.
- **Families** group categories (e.g. "Screen Drain", "Learning"). They are a first-class,
  editable concept: an ordered registry in `settings.families` (`{name,color}`), plus a
  `family` field on each category. `FAMILY_ORDER` and `CAT_FAMILY` are the *defaults* used to
  seed/migrate; after that, `famOf(cat)`, `familyColor(name)`, and `familyRank(name)` read
  live state. Edit a family (rename/recolor) via `openFamilySheet()` — renaming moves all its
  members and bumps their `mod` so it syncs. Create a new family inline from the category
  sheet's "＋ New family…" option.
- The **Track grid** groups tiles by family under small colored headers; ordering is family
  rank, then `DISPLAY_ORDER` within a family, then alphabetical.
- **Archiving** hides a category from the Track grid but keeps its history in Stats.
  Archived categories are restored from Settings → "Archived categories".
- `CAT_ALIAS` folds retired category names into replacements everywhere (seed, CSV import,
  migration) — e.g. "Morning Routine" → "Grooming".

---

## 9. Stats math & charts

The heart of Stats is one helper:

```js
overlap(s, e, a, b) = max(0, min(e,b) - max(s,a))   // ms of [s,e) inside [a,b)
totals(a, b, filterSet?) → { catId: ms, … }         // per-category ms in a window,
                                                     // INCLUDING running timers up to now
```

`totals()` is used everywhere time is summed (today's card, stats ranges, goals, family
review, the widget). Ranges are computed with `startOfDay/Week/Month`. Charts are drawn on
`<canvas>` with a small DPR-aware helper (`setupCanvas`): `drawPie` (donut with % labels and
tap-to-inspect), `drawBars` (stacked day bars for week/month), `drawDayStrip` (a horizontal
timeline of the day's events). `showChartInfo` powers tap-to-inspect (tap a slice/bar/block
to see its category, duration, share). `familyTotals()` rolls categories up to families for
the "This week vs last · daily average" panel. `dayGaps()` finds untracked holes ≥15 min so
the user can backfill them.

---

## 10. Goals

A goal targets **either one category or a whole family**:
`S.goals` = `{ id, catId?, fam?, period:"day"|"week"|"month", target:<minutes> }` — a category
goal has `catId` (and `fam:null`); a **family goal** has `fam:"<name>"` (and `catId:null`) and
sums every category in that family. Three helpers resolve both cases: `goalCatSet(g)` (the set
of category ids to total — one id, or all of a family's members), `goalName(g)`, `goalColor(g)`.
`goalProgress(g)` = `sumVals(totals(…goalCatSet(g)))` over `goalBounds(period)`.

`renderGoals()` shows a progress bar (guarded against a 0 target → no divide-by-zero); a met
goal shows an inline green check in the row's normal flow, before the period pill, so it never
overlaps the label; family goals also get a small "family" tag. `openGoalSheet()` uses the
shared type-to-search combobox (§13, prefix `"g"`) whose option list is **families and
categories, each tagged** ("family" / "category") for cohesion — family option ids are encoded
`"fam:<name>"`, category options are the raw `catId`, and the save handler decodes which was
chosen. `checkGoalCelebrate()` toasts once when
a goal is first reached (in-memory `celebrated` set keyed by goal id + period start).

**Sync notes for family goals:** the merge dedupe key is `fam ? "fam:"+name : catId` + period,
and family goals merge **without id remapping** (a family name is stable across devices, unlike
a category id). The `load()` validator accepts a goal with *either* a string `catId` or a string
`fam`. Deleting a category does not touch family goals (they aren't tied to a category id).

---

## 11. Sync engine (the big one)

Cross-device sync stores the whole dataset as one JSON file (`momentmeter.json`,
`SYNC_FILE`) inside a **private GitHub Gist**. Each device holds the user's personal access
token (gist scope) and the gist id in `settings.sync`. There is **no server** — GitHub is
the shared store, and all the merge intelligence lives on the client in `mergeRemote()`.

### 11.1 The sync loop (`syncNow`)

Every sync is: **conditional GET → merge remote into local → conditional PATCH**.

1. **Conditional GET.** We send the saved `ETag` (`If-None-Match`). If nothing changed,
   GitHub returns `304 Not Modified` — nearly free, and we skip the merge entirely. This is
   what makes idle syncing cost almost nothing.
2. **Merge.** If we got fresh content, `mergeRemote(remote)` folds it into `S` (see 11.3).
3. **Conditional PATCH (push).** We compute `quickSig(syncPayload())` — a cheap hash of the
   data — and **only PATCH if it differs from `pushedSig`** (what we last pushed). So a sync
   with no local changes writes nothing. This is critical: writes are what trigger GitHub's
   rate limits, and skipping no-op writes also stops two devices from ping-ponging updates
   forever after they've converged.

`syncPayload()` is what gets written: categories, events, goals, timers, families, and all
three tombstone arrays — **never the token** (the token stays only in `settings.sync`, which
is *not* part of the payload, and is also stripped from JSON backups).

### 11.2 When sync runs

- `syncNow(false)` — manual (tap the header pill or Settings → Sync now); shows toasts.
- `syncNow(true)` — silent/automatic. Triggered by: launch (1.5s after boot), returning to
  the app (`visibilitychange`, throttled to every 5 min), a periodic safety-net timer
  (every ~3 min while open), the `online` event, and a debounced push after any `save()`
  (`scheduleAutoPush`, 6s; `syncSoon` = 1.5s for timer start/stop so widgets update fast).
- `syncPushOnExit()` — a best-effort keepalive PATCH when the app backgrounds or closes
  (`visibilitychange` hidden / `pagehide`), so a change reaches the gist even on hard close.

### 11.3 The merge (`mergeRemote`) — read this before touching sync

Devices seed independently, so the *same* category has *different* ids on each device. The
merge reconciles by **name/content, not id**, and heals divergence. Order matters:

1. **Sanitize** the remote payload (drop null/garbage array elements) so a corrupt gist can
   never throw and abort the merge.
2. **Union the tombstones** (`deleted`, `deletedCats`, `deletedKeys`), capped in length.
3. **Settle categories FIRST** (before touching events). For each remote category:
   - Find all local categories that are "the same" — matched by id **or** by an overlap of
     name-sets (current `name` ∪ `prevNames`). This is how a rename is recognized across
     devices that never shared an id.
   - **Collapse** any duplicates/splits into one, moving their events/goals/timers over, and
     adopt the *freshest* (highest-`mod`) name/color/family. **Unify the id** to the remote's
     id so both devices converge going forward.
   - Newer `mod` wins for name/color/archived/family; older payloads still contribute their
     `prevNames` so future matches stay linked.
   - Build `idMap` (remote id → local id) for remapping events/goals/timers.
4. **Apply deletions to local events/goals** now that names are final (see §12 on why order
   matters — a rename in the same merge must not let a deleted event slip past its tombstone).
5. **Merge remote events**: skip content-deleted ones; for a same-id event, newer `mod`
   wins; dedupe by `catId|start|end` so identical seeded/imported data doesn't double.
6. **Merge remote goals** (dedupe by `catId|period`, or `fam:<name>|period` for family goals;
   family goals skip id remapping since the family name is device-stable).
7. **Merge the family registry** (add families this device lacks).
8. **Timers**: **remove any local timer that now has a matching completed event** — this is
   how a "stop" on one device propagates to another (the stopped timer's event exists, so the
   still-running local timer is dropped). Then add remote timers not already stopped; drop
   timers whose category is gone; and under switch mode, collapse multiple running timers to
   the most recent (logging the earlier ones so no time is lost).
9. `ensureFamilies()` to keep the registry/`family` fields consistent.

### 11.4 Rate-limit handling & self-healing

- **Error classification** (`syncNow` catch): 401 or 403-without-"rate limit" = the **token**
  is bad → needs a new one (status: "auth"). 403/429 with a rate-limit message = **rate
  limited** → back off, not a token problem. Anything else = network → retry.
- **Backoff / cooldown.** On a rate limit we honor GitHub's `Retry-After` (or 60s), set
  `syncCooldownUntil`, and **suppress all automatic syncs** until it passes (`inCooldown()`
  guards every auto trigger) so we stop feeding the limit. Network errors use capped
  exponential backoff. A manual tap overrides the cooldown. `online` clears a *network*
  cooldown but not a rate-limit one.
- **Self-heal a missing gist.** A `404` (gist deleted / stale id) triggers
  `syncFindOrCreateGist()` to re-find or recreate the sync file and retry the push — instead
  of wrongly telling the user their token is bad.
- **Converge split gists.** If two devices ever ended up on *different* gists (a setup race,
  or a 404 self-heal), Settings → "Re-link devices (fix sync)" runs `syncConsolidate()`: it
  merges **every** Moment Meter gist the token owns into local and writes the result to the
  oldest (canonical) one, pointing the device there. Run it on both devices to reunite them.
  `syncFindOrCreateGist` deterministically picks the **oldest** gist so devices don't diverge
  again.
- **Status surface.** `syncState` + `updateSyncPill()` drive the header pill: syncing / ok
  ("Synced 2m ago") / warn ("Paused · resuming", "Offline · retrying") / err ("Reconnect").
  Errors are also shown in the Settings sync row. `settings.sync.lastError` persists the last
  failure `{t, auth, rate, status, msg}`.

### 11.5 Concurrency & correctness invariants

- `window.__inSync` prevents two syncs overlapping (avoids read/modify/write races).
- `window.__healing` guards the 404 recovery from recursing.
- The merge is **additive and idempotent**: merging the same remote twice changes nothing;
  merging in any order converges. Deletions win via tombstones and never resurrect.
- `hget()` reads response headers defensively (never throws if headers are absent).

---

## 12. Deletion tombstones (why there are three arrays)

Deleting must *stay* deleted after it syncs, even though the deleted item may have a
different id on the other device, and its category may get renamed. So a delete records:

- **`deleted`** — the item's id (catches the same-id case).
- **`deletedKeys`** — two content keys per event: `"categoryname|start|end"` (survives id
  differences) **and** `"catId|start|end"` (rename-proof: the id doesn't change on rename).
  `contentDeleted(e)` checks both.
- **`deletedCats`** — deleted category names.

`remapDeletedKeys(old, new)` rewrites the name-based keys when a category is renamed (locally
and during merge) so tombstones track the current name. **This is why the merge settles
category names before filtering events** — otherwise a rename in the same merge would change
an event's name-key and let a deleted event slip back in. All delete paths (`deleteEvent`,
the category-delete cascade in `openCatSheet`) must push both key forms.

---

## 13. Events log, in-progress rows, swipe-to-delete

`renderLog()` shows completed events grouped by day (paginated to the 10 most recent days,
"Show all" reveals the rest), plus a live **"In progress"** section built from `S.timers`
(display-only — *not* stored events, so switch mode and the 30s rule are untouched). Tapping
an in-progress row opens `openTimerSheet()` to adjust the running timer's start time or stop
it. Completed rows: tap opens `openEventSheet()`; **swipe left** reveals a red delete zone
(the `.evrow`/`.evdel` wrapper) and, past a threshold, shows the styled `askConfirm()`
dialog before calling `deleteEvent()`.

The **Category field is a type-to-search combobox**, not a native `<select>`, and is **shared
by the event and goal sheets**. `catComboHTML(prefix, cats, selId)` builds the markup and
`wireCatCombo(cats, prefix)` wires it; `prefix` namespaces the ids (`"e"` for the event sheet
→ `#eCat`/`#eCatText`/…, `"g"` for the goal sheet → `#gCat`/…). A text input filters an
in-flow list by substring as you type, the hidden `#<prefix>Cat` holds the chosen id, Enter
picks the top match, and on blur the box snaps back to a real category so an invalid name can't
be saved. It expands in-flow (not a floating dropdown) so the sheet's `overflow-y:auto` never
clips it. Each sheet's save reads `$("#<prefix>Cat").value` (with a first-category fallback).

---

## 14. Sheets & dialogs

- **Bottom sheet** (`openSheet/closeSheet`, `#sheet` + `#backdrop`): the modal editor used by
  category/event/goal/family/timer/sync/shortcut sheets. `sheetOpen()` guards every save
  handler so a double-tap can't submit twice.
- **Confirm dialog** (`askConfirm(title, message, opts) → Promise<boolean>`, `#dialog` +
  `#dlgBack`): a styled replacement for the native `confirm()`, used for destructive actions.
  Returns a promise resolving true/false.
- **Toast** (`toast(msg)`): transient status messages.

---

## 15. Import / Export / Reports

**`reportData()` is the shared aggregator** — the single source of truth behind both the CSV
and the PDF, so the two never disagree. It returns the date range, per-category rows (with
family + share), grand total, per-family rows, per-day rollups (`byCat`/`byFam`, midnight-split
via `overlap`, DST-safe), `daysTracked`, `dailyAvg`, and goal rows (progress computed with
`goalBounds(g.period)` — the same window the Goals view uses).

- `exportAll()` — one comprehensive **CSV**: a summary block (range, totals, top category/
  family) then labelled sections — `EVENTS` (every session), `CATEGORIES` (family + share %),
  `FAMILY TOTALS`, `DAILY TOTALS` (per day × category across all history), and `GOALS` (target,
  current, met). Opens the share sheet.
- **PDF report** (`openReport` → `reportHTML` → `window.print()`): builds a styled, printable
  report into a full-screen overlay (`ensureReportStyles` injects a light "paper" stylesheet
  with `@media print` page-break + `print-color-adjust` rules). Sections: a family-spectrum
  bar, cover, four stat tiles, a family-mix donut (`reportDonutSVG`, a stroked-circle SVG donut
  with a thin ring and small slice gaps), per-family bars, a per-category table with share
  bars, a per-day stacked timeline (`stackBar`), and goal progress. "Save as PDF" calls
  `window.print()` — no libraries, works offline (Mac: print dialog; iPhone: Save as PDF →
  Share → Save to Files). Opening it on an empty install just toasts "Nothing to report yet".
- `exportJSON()` — full restorable backup; **strips `settings.sync`** so the token never
  leaves the device in a backup.
- `importCSV()` — understands both this app's CSV and the original **Timelines daily-summary
  export** (a `date` row + per-category duration columns). It aliases retired names, matches
  or creates categories, and skips duplicates. `parseCSV()` is a small quote-aware parser;
  `layoutDay()`/`hms()` place a day's duration totals into events.
- `importJSON()` — restore a backup.

---

## 16. Shortcuts URL actions

`handleURLActions()` runs at boot and reads query params so iOS Shortcuts can control
tracking via "Open URL": `?start=Work`, `?stop=Work` / `?stop=all`, `?toggle=Exercise`
(category names are case-insensitive). It then strips the query from the URL.

---

## 17. Widgets (Scriptable)

Two standalone scripts the user pastes into the free **Scriptable** app; they read the same
private gist (with the token pasted into each) and render iOS Home Screen widgets. They are
**independent of the web app** — plain Scriptable API, no shared code.

- `moment-meter-chart-widget.js` ("Moment Meter Chart") — a segmented donut of today's mix
  plus the current activity name; supports Small/Medium/Large.
- `moment-meter-now-widget.js` ("Moment Meter Now") — a clean square widget: current activity
  + a **live-ticking** timer (via WidgetKit's `applyTimerStyle`, which counts on its own),
  tinted in the activity's color.

**Widget realities to know:**
- iOS/WidgetKit decides refresh cadence (every ~15–60 min, never instant). `refreshAfterDate`
  is only a hint. There is *no* setting to force frequent refreshes; "Background App Refresh"
  does not apply to WidgetKit widgets, and Low Power Mode suspends widget refresh entirely.
- Only date/timer text (`applyTimerStyle`) auto-updates between refreshes; the category
  *name* only changes on a full refresh, so a widget can briefly show a stale activity after
  a switch. The app's header live bar is the real-time indicator; widgets are a "glance".
- Both scripts fetch with a cache-buster + no-cache headers so they never read a stale gist.
- Tapping a widget re-runs its script (a manual refresh) because no `w.url` is set; set
  `w.url = APP_URL` to make a tap open the app instead.

---

## 18. Service worker & PWA caching (a real gotcha)

`sw.js` caches the app shell for offline use. Two rules that were learned the hard way and
**must not regress**:

1. **Never intercept cross-origin requests.** The fetch handler bails out (`return`) for any
   non-same-origin request. An earlier version cached *all* GETs including the GitHub API,
   which served a **stale gist forever** and silently broke device-to-device sync. The app
   also sends `cache: "no-store"` on every sync request as belt-and-suspenders.
2. **Network-first for the page** (`index.html`) so updates arrive; cache-first for static
   assets (icons/manifest) for speed/offline. Bumping `CACHE` drops old caches on activate.

---

## 19. Testing

There is no framework — tests are standalone Node scripts using **jsdom** to load
`index.html`, mock browser APIs (canvas, media, `fetch`/GitHub, matchMedia), drive the app
by calling functions / clicking elements, and assert on `S` and the DOM. They live in the
developer's scratch area (not shipped) but the patterns are: extract the `<script>`,
`node --check` it, then run scenario scripts. Coverage includes: core flows (smoke),
adversarial/hostile input, families, live activity + live bar, the 30s rule and switch mode,
and an extensive **sync** battery — two/three-device convergence, idempotency, rename
propagation, split repair, two-gist convergence, rate-limit backoff, error classification,
efficiency (idle = zero writes, no ping-pong), stop-propagation, and the confirm dialog.

**When you change sync or timers, re-run the sync + threefix + livebar batteries.** The two
tracking invariants (switch mode, 30s rule) and the merge invariants (no resurrection, no
duplicate categories, convergence) are the things most likely to break subtly.

---

## 20. Known limitations & gotchas (quick list)

- **Widget refresh is iOS-controlled** — not instant, not forceable (§17).
- **PWA vs Safari storage** — iOS gives an installed Home Screen app and Safari *separate*
  localStorage. Sync (or a JSON backup) is the bridge. Shortcuts URLs open in Safari.
- **localStorage can be evicted** if a site sits unused — hence the backup nudge and the
  "last exported" indicator; sync is the durable backup.
- **GitHub secondary rate limits** are account-wide and can last up to an hour; the fix is to
  stop poking it (the backoff does this) and wait. A new token does *not* reset a rate limit.
- **Two-device setup race** can create two gists → "Re-link devices" converges them (§11.4).
- **Clock skew** between devices affects `mod`-based conflict resolution; normally negligible.
- **No compile step** — keep everything dependency-free and in the single file; don't
  introduce a bundler without good reason.

---

## Appendix: function index (by area)

- **State/seed:** `makeSeed` (default categories, no history), `load`, `save`,
  `isPristineOldInstall`, `ensureFamilies`.
- **Format/time:** `fmtDur`, `fmtClock`, `fmtTime`, `fmtDay`, `startOfDay/Week/Month`,
  `endOfMonth`, `toLocalInput`, `toast`.
- **Math:** `totals`, `overlap` (inline), `familyTotals`, `dayGaps`, `quickSig`.
- **Timers/live:** `startTimer`, `stopTimer`, `toggleTimer`, `stopAllTimers`, `timerFor`,
  `updateLiveBar` (header live bar; no OS/media-session code exists anymore).
- **Views:** `renderTrack`, `renderLog`, `renderStats`, `renderGoals`, `renderSettings`,
  `renderAll`, `switchView`; charts `drawPie/drawBars/drawDayStrip/setupCanvas/roundRect/showChartInfo`.
- **Families:** `famOf` (inline), `familyList`, `familyColor`, `familyRank`, `openFamilySheet`.
- **Goals:** `goalBounds`, `goalCatSet`, `goalName`, `goalColor`, `goalProgress`,
  `checkGoalCelebrate`, `openGoalSheet` (category- or family-targeted).
- **Sheets/dialogs:** `openSheet`, `closeSheet`, `sheetOpen`, `askConfirm`, `openCatSheet`,
  `openEventSheet`, `catComboHTML` / `wireCatCombo` (shared category search box, event + goal),
  `openTimerSheet`, `openGoalSheet`, `openShortcutSheet`, `deleteEvent`.
- **Sync:** `ghApi`, `hget`, `syncListGists`, `syncFindOrCreateGist`, `syncConsolidate`,
  `syncPayload`, `mergeRemote`, `remapDeletedKeys`, `contentDeleted` (inline), `quickSig`,
  `syncNow`, `syncConnect`, `syncPushOnExit`, `scheduleAutoPush`, `syncSoon`, `scheduleRetry`,
  `inCooldown`, `setSyncState`, `updateSyncPill`, `fmtSyncAgo`, `openSyncSheet`.
- **Import/export/reports:** `reportData` (shared aggregator), `exportAll` (CSV), `openReport`
  / `reportHTML` / `reportDonutSVG` / `stackBar` / `ensureReportStyles` (PDF report),
  `exportJSON`, `importCSV`, `importJSON`, `parseCSV`, `layoutDay`, `hms`, `download`,
  `markBackedUp`, `lastBackupLabel`.
- **Boot/misc:** `handleURLActions`, `applyTheme`.

