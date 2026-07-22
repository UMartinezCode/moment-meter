# Moment Meter

A personal time tracker that replaces the Timelines iPhone app. Runs as a web app you install on your Home Screen. All data stays on your device (localStorage), works offline once installed.

## What it does

Tap-to-start timers per category (multiple at once), an events log with add/edit for past entries, a Stats tab with a day timeline strip, stacked bar charts (week/month), a donut chart with category filters, daily/weekly/monthly goals with progress bars, one-tap export of everything, JSON backup/restore, CSV import, and automatic dark mode. Timers survive closing the app.

## Pre-loaded data (your real exports)

The app ships with your actual data: all 22 categories from the "Categories" screenshots plus 15 you selected (Anki / Flashcards, Board Prep, Research, Shadowing, Mentorship & Networking, Student Orgs & Leadership, Email & Admin, Finances, Social Media, Movies & TV, Podcasts / Music, Family Time, Partner / Dating, Planning / Journaling, Grooming), and the July 17–21 daily totals from the CSVs in "Pre-existing Data" — accurate to the second per category. Colors follow themed families: reds for screen drain, greens for learning, teals for career, oranges for food and mornings, golds for logistics and money, blues for connection, cyans for intentional media, purples for rest and mind, pink for movement. Because those exports contain durations rather than start/end times, each day is laid out in a natural sequence (Sleep from midnight, Morning Routine, the day's activities, Bed & Brainrot last); days that exceed 24 hours from parallel timers overlap at day's end so daily totals stay exact.

**Importing future exports:** Settings → Import CSV understands the same Timelines daily-export format (date + category columns). It matches your existing categories, creates any new ones with sensible colors, and skips days already imported — so you can re-import overlapping files safely. Settings → **Reset to pre-loaded data** restores this dataset anytime.

## Your live site

The app is deployed at **https://umartinezcode.github.io/moment-meter/** (repo: github.com/UMartinezCode/moment-meter). On your iPhone: open that URL in **Safari** → Share → **Add to Home Screen**. It launches full-screen with its own icon, works offline, and keeps data on the phone.

The repo should contain five files: `index.html`, `manifest.json`, `sw.js`, `icon-180.png`, `icon-512.png`. To update the app after changes, re-upload the changed file (usually just `index.html`) on the repo page — the app picks up the new version on next launch.

## iPhone ↔ Mac sync

Settings → **iPhone ↔ Mac sync** keeps devices merged through a private Gist in your own GitHub account — no third-party server, and your data stays yours. One-time setup: create a free GitHub personal access token (classic) with only the **gist** scope (github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)), paste it into the app on each device, done. The app then syncs automatically on launch and when you return to it, or on demand via Sync now.

The merge is genuinely two-way: events, categories, goals, and even running timers flow both directions; categories are matched by name across devices; identical data (like the pre-loaded history) deduplicates instead of doubling; deletions propagate and stay deleted; and if the same event was edited on both devices, the newer edit wins. The token is stored only on-device, and the gist is private.

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
