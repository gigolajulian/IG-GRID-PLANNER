# Grid Planner — Instagram 3:4 feed preview

A single-file, offline feed planner. No build step, no backend, no login.

## Run it

Double-click `index.html`, or drag it into a browser window. That's it — the
planner itself needs nothing else.

The only reason to run the server is **Sign in with Instagram** (see below):

```bash
node server.mjs --https
```

Note that `file://` and `http://localhost` are separate origins with separate
localStorage, so a plan made by double-clicking the file won't appear when you
switch to the server. Use **Export** → **Import** to carry it across.

Everything lives in that one file. Your plan is saved to the browser's
`localStorage` under the key `ig-grid-planner-v1`, so it survives reloads —
but it is tied to **that browser on that machine**, so use **Export** for
real backups.

## The starter feed

Your current 12-post grid is **baked into `index.html`** already sliced, with the
two pinned posts pinned. Open the file and it's just there.

It's inlined as a `<script type="application/json">` block rather than a separate
`seed.json`, because a `file://` page is blocked from fetching sibling files —
inlining is what makes it work on a plain double-click. Adds ~350 KB of JPEG to
the file.

Rules it follows:

- It loads **only on a genuinely empty first run**. If you have any plan saved, it
  stays out of the way — it can never overwrite your work.
- Once it has loaded once, or once you hit **Clear everything**, it's retired and
  won't reappear.
- **⋯ → Reload starter feed** brings it back deliberately (it asks first if you'd
  be replacing something).

To re-bake it later from a newer screenshot: import the screenshot, then
**⋯ → Export plan**, and paste that JSON into the `seedPlan` script tag.

## Using it

Hover any tile for its four controls: **pin**, **crop**, **planned/posted**, **remove**.
Click a tile to open the inspector for everything else. Anything you use rarely
(export, import, refresh, clear) lives under the **⋯** menu.

The staging tray sits in a sticky rail down the left, so unplaced shots stay in
view while you work the grid. On narrow screens it drops back underneath.

| Action | How |
| --- | --- |
| Add photos | **Add photos**, or drop image files anywhere on the page. They land in the staging tray. |
| Slot a photo into the feed | Drag it from the tray into the grid, or use **Place in grid** — which drops it at the head of the feed, just under the pins, since that is what you post next. |
| Reorder | Drag any tile. A white bar shows where it will land; everything else reflows 3-wide. |
| Unslot | Drag a grid tile down onto the tray, or use **Send to tray** in the inspector. |
| Pin | The 📌 button on a tile, `F`, or **Pin to top** in the inspector. |
| Remove | The `✕` on a tile, or `Delete`. Undo from the toast or with `Ctrl+Z`. |
| Nudge the crop | Click a tile and drag inside the big 3:4 preview. Or hit `⊕` on the tile and drag it in place. |
| Planned ⇄ posted | The `○`/`●` button on a tile, or **Mark posted** in the inspector. |
| Caption / notes | Inspector → *Caption / notes*. Tiles with a note get a small white dot. |
| Quick actions | **Right-click any tile** for a compact menu: send to tray / place in grid, pin, planned-posted, crop, options, duplicate, remove. |


### Trying several frames in one slot

Shot a set and can't decide which frame earns the slot? Open a tile and use
**Options for this slot** to add the other candidates. Each thumbnail is graded
for that exact position against its real neighbours, so the comparison is like
for like — click one to swap it in, and the loser goes back into the list.
The tile shows an option count, and its ⇄ button cycles through them in
place so you can watch the grid change.

Options ride along with the plan through save, export and undo.

### Pinning

Instagram floats pinned posts to the front of your profile regardless of date and
caps it at **three**. This mirrors that exactly: pinned tiles hold the first
slots, show a pin badge, and **cannot be dislodged** by dragging other tiles
around — drop something at slot 1 and it lands after the pins instead. Trying to
pin a fourth tells you to unpin one first.

This is also why pins matter for importing: see *Ordering* below.

Slot 1 is top-left = your newest post; order flows left-to-right, top-to-bottom,
exactly like the real feed.

### Views

- **Phone** — a ~412px device mock, 1.5px gutters. This is the honest preview.
- **Desktop** — the same grid, larger, for judging detail.
- **Rows** — each 3-tile row isolated in its own block, with average brightness,
  brightness *spread* across the row, and average busyness, plus a tonal strip
  under the row. Dragging still works across rows here.

### Rhythm overlay

Toggle **Rhythm**. Every grid tile gets an **A–D badge** rating how well that photo
reads *in that exact slot*, judged against its real neighbours: tonal contrast
weighted first, texture second, with penalties for forming a dark-on-dark or
busy-on-busy pair. Hover the badge for the reason in words plus the raw numbers.

Thresholds are **relative to your own set**, not absolute: the darkest third counts
as "dark", the busiest third as "busy". A fixed cutoff would flag a low-key feed as
one solid dark mass and tell you nothing.

- Amber inset outline — this tile and a neighbour are **both dark**.
- Magenta inset outline — both **busy**.
- The header counts total clashes.

Grades and stats recompute whenever anything moves or you nudge a crop.

**Arrange** reorders your pending posts to maximise the whole grid's score;
**Reflow** does the same for the already-posted tiles. Neither touches the other's
region, and pinned tiles never move. Press either again for a different strong
arrangement — it remembers the last few it showed you.

### Posted marker

Posted tiles get a thin blue rule along the bottom and a blue corner dot, so you
can see where planning ends and your real feed begins.

### Keyboard

With a tile selected: `←` `→` move it, `P` toggles posted, `F` pins/unpins,
`C` toggles crop mode, `Delete` removes it, `Esc` closes.
`Ctrl+Z` (or the `↶` button) undoes any change, up to 40 steps back.

## Pulling in photos you've already posted

**Instagram** in the toolbar opens the import sheet. **Refresh** (`⟳`) re-runs
whichever source you last connected.

Imported posts arrive marked **posted**, newest first, positioned *below*
anything you're still planning. Captions become notes. Re-syncing matches on the
Instagram media id, so **already-imported photos are skipped and your crops and
notes are never overwritten** — a refresh only adds what's new.

### 1. From your data export — recommended

In the Instagram app: **Settings → Accounts Centre → Your information and
permissions → Download your information**. Request **JSON** format (not HTML)
and include **Posts**. Instagram emails you an archive, usually within a few hours.

Then either **Pick export folder** (after unzipping) or **Pick the .zip**
directly — the app reads the archive without unpacking it, streaming only the
entries it needs, so a multi-GB export won't blow up memory.

Works with any account type, entirely offline, and nothing expires.

### 2. Sign in with Instagram (real OAuth)

Requires a **Business or Creator** account and your own Meta app. Personal
accounts can't do this at all — Instagram shut down the Basic Display API in
December 2024 and nothing replaced it.

**Setup, once:**

1. At [developers.facebook.com](https://developers.facebook.com) create an app,
   add the **Instagram** product, and open *API setup with Instagram login*.
2. Copy `config.example.json` to **`config.json`** and paste in your Instagram
   **app ID** and **app secret**.
3. Add your redirect URI to the app's **Valid OAuth Redirect URIs**. It must
   match `redirectUri` in `config.json` character for character. Meta requires
   **https**, so start the server with `--https`:

```bash
node server.mjs --https
```

That generates a self-signed certificate for `localhost` via openssl on first
run (your browser will warn once — accept it). If Meta rejects
`https://localhost:8443/auth/callback`, put a tunnel in front instead
(ngrok/cloudflared) and set `redirectUri` to the tunnel's https URL.

4. Open the address it prints, hit **Instagram → Sign in with Instagram**.

You sign in **on Instagram's own page**. Your password never touches this app,
and there is deliberately no username/password field anywhere in it.

**Why a server at all:** the code-for-token exchange requires your app *secret*,
which cannot live in browser JavaScript. So the token is held by the server and
**never reaches the page** — the browser asks `/api/media`, the server calls
Instagram. That also removes two CORS problems: the Graph API call, and the CDN
image fetches (which would otherwise taint the canvas and break the brightness
analysis).

The server binds to **loopback only**, refuses to serve `config.json`,
`.token.json` or the `.pem` files, rejects requests with a foreign `Host`
header (DNS-rebinding guard), validates the OAuth `state` parameter, and will
only proxy images from Instagram/Facebook CDN hosts. Tokens are upgraded to
long-lived (60 day) and auto-refreshed in their final week. **Sign out** deletes
the token file.

**Without the server** (opening `index.html` directly) the login button is
replaced by a paste-an-access-token field. That token lives in localStorage and
is deliberately excluded from exported JSON, so sharing a plan never leaks it.
A `file://` page is usually blocked from calling `graph.instagram.com`, in which
case you'll get a clear message rather than a silent failure.

If a photo's pixels can't be copied locally, the tile falls back to Instagram's
CDN URL and is labelled preview-only — those links are signed and expire within
hours, so they won't survive a reload.

### 3. From a screenshot of your profile

Screenshot your profile grid, **Instagram → Pick screenshot**, and the app slices
it back into tiles. No account type, no Meta app, no waiting for an export.

**If detection gets it wrong, type how many posts are in the shot** and it re-solves
for the geometry that yields exactly that many rows, anchored to the first one. It
also trims to that count, so asking for 3 imports the top row only. Asking for more
posts than physically fit is capped, and says so rather than quietly shrinking the
cells to make the number work.

Otherwise it finds the grid on its own by looking for the gutters — the only full-length
runs of near-constant colour in the image. Thresholds are computed *relative to
each screenshot*, so a low-key, hard-flash feed doesn't read as "flat" and get
mistaken for gutters. It then locks onto the grid by sliding a comb of the
detected row pitch across the image, which is what keeps a busy profile header
from being counted as an extra row. Every number is adjustable with a live
preview, so when detection is off you can nudge it in seconds.

**Pinned posts are detected and pinned for you.** Instagram's pin badge and its
carousel badge are both pure-white glyphs in a cell's top-right corner, so the
importer isolates that glyph — thresholding for near-white, keeping the blob that
doesn't touch the patch edge (a bright background always does; the inset icon never
does), then normalising it to its bounding box and matching the two shapes. On a
real profile screenshot the two classes land ~120 bits apart out of 256, so it is
not a close call. It respects the 3-pin cap and tells you if it hit it.

Trade-offs: you get screenshot-resolution thumbnails with Instagram's 3:4 crop
already baked in, no captions or dates, and Instagram's own badges are part of the
pixels.

### Ordering, and why the screenshot route is special

Imports come back strictly newest-first, so slot 1 (top-left) is your latest
post — the same way your profile grid reads.

The exception is **pinned posts**. Instagram floats up to three to the top of
your profile, but doesn't mark them as pinned in *any* API response or in the
data export. They are undetectable programmatically, so via the API or an export
they import in date order and you re-pin them yourself.

**A screenshot doesn't have that problem.** It captures the grid as rendered,
pins already in place — so it is the only import route that reproduces your true
profile order in one step. Pin those tiles afterwards and they stay put.

## Data and storage

- Imports are downscaled to 1000px on the long edge and re-encoded as JPEG q0.82
  before storage — roughly 30–40 KB per photo, so ~150 photos fit a typical 5 MB
  quota. Originals on disk are never touched.
- **Export** writes a `.json` containing the whole plan *including image data* —
  a complete, portable backup. **Import** restores it (replacing the current plan).
- If the quota is blown, the app degrades on purpose: it retries saving the plan
  **without** the pixels, so order, crops, notes and posted flags survive, and
  shows an amber banner with an Export button. Tiles whose image was dropped
  render as a placeholder; use **Replace image** in the inspector to re-attach.
