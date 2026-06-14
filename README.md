# FocusLog — Study Timer

A clean, dark-themed study timer that logs your sessions, lets you plan ahead, and
shows you how and when you study. It's an installable **PWA**, so it lives on your
Windows taskbar *and* your iPhone Home Screen, with the **same data synced across both**
through a free Supabase backend. It also works fully offline.

## 🔗 Live app

**https://chrisovs.github.io/focuslog/**

Open that link on any device to use FocusLog. Install steps below.

---

## 📱 Install on your iPhone (Safari)

> It **must be Safari** — iOS only lets Safari add web apps to the Home Screen.

1. Open **Safari** on your iPhone and go to **https://chrisovs.github.io/focuslog/**
2. Tap the **Share** button — the square with an upward arrow (bottom centre of the screen, or top-right on iPad).
3. In the share sheet, **scroll down** and tap **“Add to Home Screen.”**
4. Leave the name as **FocusLog** (or change it), then tap **Add** (top-right).
5. Close Safari. Tap the new **FocusLog** icon on your Home Screen — it opens full-screen, just like a native app.

### Turn on sync on the iPhone

So your phone shows the same data as your PC:

6. In FocusLog, go to **Settings → Sync across devices**.
7. Enter your project details and tap **Save connection**:
   - **Project URL:** `https://idzikqlyymapnsbbdlcr.supabase.co`
   - **Public key:** `sb_publishable_b7pWw9WDpgVxyTgyQwCFNQ_doPrKOMB`
   *(This is the publishable/anon key — safe to keep here; your rows are protected by Row Level Security.)*
8. **Sign in** with the **same email and password** you created on your PC.
9. Tap **Sync now** (or just wait — auto-sync runs). Your exams, sessions, and plans appear. 🎉

> Tip: after signing in once, the app remembers it. Open FocusLog from the Home Screen and your data is there.

---

## 💻 Install on your PC (Windows taskbar)

1. Open **https://chrisovs.github.io/focuslog/** in **Edge** or **Chrome**.
2. Click the **Install** icon at the right of the address bar (or menu **⋯ → Apps → Install FocusLog**). You can also use the **Install app** button on the app’s Settings page.
3. It opens in its own window. **Right-click its taskbar icon → Pin to taskbar.** Now one click launches it.
4. Sync is already set up on this device. If you ever need it again: Settings → Sync → the URL/key above → sign in.

---

## 🔁 How sync works

- Data is saved **locally on each device** and synced through **your own Supabase project**.
- Only **you** can read it — every row is tied to your account via Row Level Security.
- With sync **off** (blank URL/key), nothing ever leaves the device.
- Changes flow automatically a couple of seconds after you make them (Auto-sync), or tap **Sync now**.

---

## ✨ Features

- **Timer** — stopwatch or countdown with a focus ring. Break reminders announce with a chime, a spoken message, a notification, and an on-screen banner.
- **Effort & attention logging** — rate each session (effort 1–5, % attention), add a note, tag the exam. Add past sessions manually too.
- **Plan** — one-off or recurring weekly sessions (e.g. every Saturday), with notes and an exam.
- **Exams** — add your own or pick from the dropdown; set an exam date for a live countdown.
- **Insights** — total/weekly hours, day streak, averages, a minutes-per-day chart, a “when you study” heatmap, time-per-exam bars, an effort/attention trend, and auto-generated suggestions.
- **Your data** — JSON backup/restore, CSV export, demo data, or clear everything.

---

## 🗂 Project files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `manifest.webmanifest`, `service-worker.js` | Make it installable / offline |
| `*.png` (icons) | App icons |
| `supabase-setup.sql` | One-time database setup for sync |

---

## 🛠 Re-create the sync backend (only if you ever need to)

1. Create a free project at **https://supabase.com**.
2. **SQL Editor → New query**, paste **`supabase-setup.sql`**, **Run**.
3. **Settings → API Keys**, copy the **Project URL** and the **publishable** key.
4. Put them into FocusLog → Settings → Sync, then create an account and sign in.

Enjoy your focused study sessions. 📚
