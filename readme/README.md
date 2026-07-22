# Moment Meter

A personal time tracker that replaces the Timelines iPhone app. Runs as a web app you install on your Home Screen. All data stays on your device (localStorage), works offline once installed.

## What it does

**Track** — tap a category to start timing it. Categories are grouped into color-coded families (Screen Drain, Food, Self-care, Fitness, Learning, Career, Logistics, Connection, Leisure & Media, Sleep), each with an editable header showing today's total. "Switch mode" (on by default) means one activity at a time — starting a new one stops and logs the previous. A "Tracked Today" card up top shows the day's total with a segmented category mix bar and top-3 legend. While tracking, a live bar pinned to the header shows the running activity and a ticking clock on every screen; tap it to adjust the start time or stop.

**Log** — the running activity appears as a live "In progress" row (tap to edit its start time), above your completed events grouped by day. Tap an event to edit it, or swipe it left to delete (with a confirmation).

**Stats** — Day / Week / Month views with a day-timeline strip, stacked bar charts, and a donut, all tap-to-inspect (tap a slice/bar/block to see which category it's from). Filter by category chips, see untracked-time gaps you can fill in, and a "this week vs last · daily average" family comparison with up/down deltas.

**Goals** — daily / weekly / monthly time goals per category with progress bars.

**Plus:** editable categories and families, one-tap CSV export of everything, JSON backup/restore, CSV import (Timelines format), automatic dark mode, and Siri Shortcuts control. Timers survive closing the app, and everything works offline.

## Categories & families

Categories are grouped into ten color-coded families. The current set:

| Family | Categories |
|--------|-----------|
| **Screen Drain** (red) | Bed & Brainrot, FP, YouTube, Social Media |
| **Food** (orange) | Cooking, Eating |
| **Self-care** (purple) | Grooming, My Health, Journaling |
| **Fitness** (pink) | Exercising, Yoga, Meditation |
| **Learning** (green) | Clinical Training, Lecture, Board Prep, Studying, Reading, Anki |
| **Career** (teal) | Research, Shadowing, Mentorship, Student Orgs |
| **Logistics** (gold) | Finances, Email & Admin, Reduce Entropy, Commuting, Housekeeping, Shopping |
| **Connection** (blue) | Socializing, Family Time, Volunteer Service, Partner & Dating |
| **Leisure & Media** (cyan) | Leisure, Movies & TV, Podcasts, Programming |
| **Sleep** (indigo) | Sleep |

Everything here is editable in the app: rename/recolor a category or reassign its family from its tile (⋯ or the family header's "edit"), create new families inline, and archive categories you don't use (they leave the Track grid but keep their history; restore them from Settings). Within each family the tile colors step from dark to light so related activities read as a group in the charts.

## Pre-loaded seed data

On first run (or Settings → **Reset to pre-loaded data**) the app seeds itself from the July 17–21 daily totals in the "Pre-existing Data" CSVs — accurate to the second per category. Because those exports contain durations rather than start/end times, each day is laid out in a natural sequence (Sleep from midnight, the day's activities, screen time last); days that exceed 24 hours from parallel timers overlap at day's end so daily totals stay exact. The family colors above define the theme.

**Importing future exports:** Settings → Import CSV understands the same Timelines daily-export format (date + category columns). It matches your existing categories, creates any new ones with sensible colors, and skips days already imported — so you can re-import overlapping files safely.

## Your live site

The app is deployed at **https://umartinezcode.github.io/moment-meter/** (repo: github.com/UMartinezCode/moment-meter). On your iPhone: open that URL in **Safari** → Share → **Add to Home Screen**. It launches full-screen with its own icon, works offline, and keeps data on the phone.

The repo must contain, **at the root**, these files/folders that reference each other by relative path: `index.html`, `manifest.json`, `sw.js`, and an `app_icons/` folder holding `icon-180.png` and `icon-512.png`. (The `widget_scripts/` and `readme/` folders are just for organization — the running app doesn't use them.) To update the app after a change, re-upload the changed file (usually `index.html`, and `sw.js` if its cache version changed) on the repo page, then fully quit and reopen — the app picks up the new version on next launch. Settings shows the current build tag so you can confirm which version is live.

## iPhone ↔ Mac sync

Settings → **iPhone ↔ Mac sync** keeps devices merged through a private Gist in your own GitHub account — no third-party server, and your data stays yours. One-time setup: create a free GitHub personal access token (classic) with only the **gist** scope (github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)), paste it into the app on each device, done. The app then syncs automatically on launch and when you return to it, or on demand via Sync now.

The merge is genuinely two-way: events, categories, goals, and even running timers flow both directions; categories are matched by name across devices; identical data (like the pre-loaded history) deduplicates instead of doubling; deletions propagate and stay deleted; and if the same event was edited on both devices, the newer edit wins. The token is stored only on-device, and the gist is private.

## Live activity indicator

While a timer runs, a live bar sits in the header on every screen showing the current activity and a ticking clock, with a stop button — tap it to adjust the start time or stop. This is the reliable, real-time "am I tracking" indicator, updated instantly on-device. (An earlier silent-audio Lock-Screen version was removed; it was flaky. For a Lock-Screen glance, use the Scriptable widget below.)

## Home Screen widgets (Scriptable)

iOS gives web apps no access to the Home Screen widget system, so real widgets need a widget-scripting app — the free, reputable **Scriptable** is used here, and it reads your data straight from your sync Gist. Two scripts live in `widget_scripts/`:

- **`moment-meter-chart-widget.js`** ("Moment Meter Chart") — a segmented donut of today's category mix plus the current activity; Small / Medium / Large.
- **`moment-meter-now-widget.js`** ("Moment Meter Now") — a clean square widget: the current activity with a big **live-ticking** timer, tinted in the activity's color.

Setup (one time, per script): install Scriptable → new script (+) → paste the file → fill in `GIST_ID` (Settings shows it, with a Copy button) and `TOKEN` (your GitHub token) → name it as noted above. Then Home Screen → long-press → + → Scriptable → add a widget → long-press → Edit Widget → pick the script. Tapping a widget re-runs it (a manual refresh). Requires sync to be set up.

**Widget refresh reality:** iOS/WidgetKit decides when to refresh widgets on its own schedule (every ~15–60 min, never instant), and Low Power Mode suspends refreshes entirely — there's no setting to force it. The live timer ticks on its own once shown, but the current *activity* only updates on a refresh, so a widget can briefly trail a category switch. For real-time, rely on the in-app live bar.

## Siri Shortcuts / automations

In the Shortcuts app, add an **Open URLs** action (your live site is https://umartinezcode.github.io/moment-meter/):

- Start a timer: `https://umartinezcode.github.io/moment-meter/index.html?start=Studying`
- Stop a timer: `...?stop=Studying` — or stop everything: `...?stop=all`
- Toggle: `...?toggle=Exercising`

Category names are case-insensitive. Attach these to Siri phrases, Home Screen icons, or automations (e.g. start "Exercise" when you arrive at the gym, stop all timers at bedtime). The same help text lives in the app under Settings → Siri Shortcuts setup.

## Notes & known iOS quirks (already handled)

- **Export everything (CSV)** in Settings downloads one file with all events, category totals, and goals; **Backup (JSON)** is a full restorable snapshot. The Settings row shows how long ago you last exported, and the app nudges you every two weeks — browser storage can be evicted by iOS if a site sits unused, so occasional backups are your safety net.
- iOS keeps **separate storage** for the Home Screen app vs Safari. Shortcuts URLs open in Safari, so if automations matter, use the app in Safari day-to-day; a JSON backup moves data between the two in seconds. (This caveat is also shown inside the app.)
- Updates: the app checks the network for a new version each launch and falls back to the offline copy when there's no signal.
- Multiple open tabs stay in sync; timers under 30 seconds are discarded as mis-taps; the events log paginates past 10 days so big histories stay fast.
