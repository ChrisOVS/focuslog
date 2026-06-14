# FocusLog — Study Timer

A clean, dark-themed study timer that logs your sessions, lets you plan ahead, and
shows you how and when you study. It's a **PWA** (Progressive Web App), so you can
install it on your Windows taskbar *and* your iPhone home screen, and optionally
**sync the same data across both** through a free Supabase backend.

It works **fully offline** and **local-only** out of the box — sync is optional.

---

## What's inside

| File | What it is |
|---|---|
| `index.html` | The app |
| `styles.css` | Dark theme (indigo / teal / amber accents) |
| `app.js` | All the logic — timer, planner, insights, sync |
| `manifest.webmanifest` | Makes it installable |
| `service-worker.js` | Offline caching |
| `icons/` | App icons |
| `supabase-setup.sql` | One-time database setup for cross-device sync |

---

## Features

- **Timer** — stopwatch or countdown, with a focus ring. Break reminders announce
  themselves with a chime, a spoken message ("You've done 25 minutes, take a break"),
  a desktop notification, and an on-screen banner.
- **Logging** — when you finish, rate your **effort (1–5)** and **% attention**, add a
  note, and tag the exam. You can also add past sessions **manually**.
- **Plan** — schedule **one-off** sessions on a date or **recurring weekly** ones
  (e.g. every Saturday), each with optional notes and an exam.
- **Exams** — add your own or pick from the dropdown anywhere; set an exam date to get
  a live countdown.
- **Insights** — total/weekly hours, day streak, avg effort & attention, a
  minutes-per-day chart, a "when you study" heatmap, time-per-exam bars, an
  effort/attention trend line, and **automatic suggestions**.
- **Your data** — export/import a JSON backup, export sessions to CSV, load demo data
  to explore, or clear everything.

---

## 1. Use it right now (no setup)

Just open `index.html` in your browser (double-click it) and start using it.
Everything saves locally on that device. To get the installable app icon, taskbar
pinning, and notifications, host it (Step 2) — those need a real web address.

---

## 2. Install on your PC (Windows taskbar)

PWAs install best from a hosted **https** address. The two easiest free options:

### Option A — Netlify Drop (no account, 60 seconds)
1. Go to **https://app.netlify.com/drop**.
2. Drag this whole folder onto the page.
3. You'll get a URL like `https://your-name.netlify.app`. Open it in **Edge** or **Chrome**.
4. Click the **Install** icon in the address bar (or menu → **Apps → Install FocusLog**).
5. The app opens in its own window. **Right-click its taskbar icon → Pin to taskbar.** Done — now you just click to run it.

### Option B — GitHub Pages
1. Create a repo, upload these files, enable **Settings → Pages** on the `main` branch.
2. Open the published URL in Edge/Chrome and install as above.

---

## 3. Install on your iPhone

1. Open the **same hosted URL** (from Step 2) in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. It now behaves like a native app, full-screen with its own icon.

> iOS only allows install from Safari, and notifications on iOS require the app to be
> added to the Home Screen first.

---

## 4. Turn on sync across PC ↔ iPhone (optional)

This keeps the same sessions, plans, and exams on every device. One-time setup:

1. Create a free account at **https://supabase.com** and a **New project**
   (any name; remember the database password).
2. In the project, open **SQL Editor → New query**, paste the contents of
   **`supabase-setup.sql`**, and click **Run**. This creates the tables and locks them
   down so only *you* can see your data.
3. In the project, go to **Settings → API** and copy:
   - **Project URL** (e.g. `https://abcdxyz.supabase.co`)
   - **anon public** key (the long `eyJ...` string — it's safe to use in the app)
4. Open FocusLog → **Settings → Sync across devices**. Paste the URL and anon key,
   click **Save connection**.
5. Click **Create account** with an email + password (use the same login on every device).
6. Hit **Sync now**. On your iPhone, install the app, enter the *same* URL/key, sign in
   with the *same* account — your data appears. With **Auto-sync** on, changes flow
   automatically a couple of seconds after you make them.

**Privacy:** with sync off, nothing ever leaves your device. With sync on, your data
lives only in *your* Supabase project, readable only by your account (enforced by the
Row Level Security policies in the SQL file).

---

## Tips

- Change the **accent colour** (indigo / teal / amber) and reminder intervals in **Settings**.
- The **break reminder** interval and a longer "you've been going a while" nudge are both configurable.
- Use **Load demo data** in Settings to see what the Insights tab looks like with ~6 weeks of activity, then **Clear all data** when you're ready to start for real.

Enjoy your focused study sessions. 📚
