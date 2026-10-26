# Setup guide

About 20 minutes, all free. You need a Google account, a GitHub account, and the iPhone.

## 1. Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) while signed in to Google.
2. Name it **Scholz Kitchen**. Leave sharing as private (don't share it with anyone).

## 2. Add the API (Apps Script)

1. In the Sheet: **Extensions > Apps Script**. A code editor opens.
2. Delete everything in `Code.gs`, then paste the full contents of [`apps-script/Code.gs`](../apps-script/Code.gs) from this repo. Click the save icon.
3. Make a secret token: a long random string (32+ characters). A password manager's generator works well. Keep it somewhere you can copy from on the phone (e.g. your password manager).
4. Left sidebar: **Project Settings** (gear) > **Script properties** > **Add script property**:
   - Property: `TOKEN`
   - Value: your secret
   - **Save script properties**.
5. Back in the **Editor** (`< >` icon): pick `setupSheet` in the function dropdown at the top, click **Run**.
   - Google asks for permission. Choose your account. You'll see "Google hasn't verified this app": that's normal for your own script. Click **Advanced > Go to (project name) (unsafe) > Allow**.
   - When it finishes, the Sheet has 10 tabs (Inventory, ShelfLife, Tools, People, Recipes, Ratings, WeekPlan, Events, ShoppingList, Gaps).
6. **Deploy > New deployment**. Click the gear next to "Select type" > **Web app**.
   - Description: `v1`
   - Execute as: **Me**
   - Who has access: **Anyone** (the token is what protects it; without the token every request is refused)
   - **Deploy**, then copy the **Web app URL** (ends in `/exec`). This is your Apps Script URL.

> Updating the script later: paste the new code, then **Deploy > Manage deployments > pencil icon > Version: New version > Deploy**. The URL stays the same. (A *new* deployment would give a new URL.)

## 3. Put the app on GitHub Pages

The repo must be public on a free account, which is why no personal data is in it (`seed/` is gitignored, and the URL/token only live on your devices).

1. Create a new **public** repo on GitHub, e.g. `scholz-kitchen`. Don't add a README.
2. Push this folder to it (or ask Claude Code to do it):
   ```bash
   git remote add origin https://github.com/<you>/scholz-kitchen.git
   ```
   ```bash
   git push -u origin main
   ```
   Before the first push, check `git status` does **not** list anything under `seed/`.
3. On GitHub: **Settings > Pages > Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, **Save**.
4. After a minute the site is at `https://<you>.github.io/scholz-kitchen/`.

## 4. Load your seed data (easiest from the computer)

1. On the computer, open `https://<you>.github.io/scholz-kitchen/#/settings`.
2. Paste the Apps Script URL and token. Tap **Save & test**: you should see "Connected".
3. Go to **More > Import > Load file(s)** and select all four files in `seed/`: `people.json`, `recipes.json`, `tools.json`, `inventory.json`.
4. Read the preview (counts per tab, anything flagged), then **Write 168 changes to Sheet**.
5. Open the Sheet in Google: the tabs now have rows.

## 5. Install on the iPhone

1. Open the GitHub Pages URL in **Safari** (it must be Safari for Add to Home Screen).
2. **Share** button > **Add to Home Screen** > **Add**.
3. Open **Kitchen** from the home screen icon. The installed app has its own storage, separate from Safari, so enter settings here:
   **More > Settings**, paste the URL and token, **Save & test**. It syncs everything from the Sheet.

## 6. Quick test (Phase 1)

- **Review** tab: badge shows how many imported rows need a look. Confirm a few.
- **Kitchen**: tap a `?` pill to set have/low/out. Tap **+** to add something with a printed date; use the +/- buttons.
- **Recipes**: open a recipe that has measured ingredients > **+ Shopping**.
- **Shopping**: turn on Airplane Mode, check off items, close and reopen the app. The checks stay and the sync pill says "N waiting". Turn Airplane Mode off: it syncs.
- **Import**: ask Claude chat for a receipt or shopping list in the format from `CLAUDE.md` and paste it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Unexpected response from Apps Script" | Deployment access isn't **Anyone**, or the URL isn't the `/exec` one. |
| "Bad token" | The token in Settings doesn't match the `TOKEN` script property (watch for spaces). |
| "Server TOKEN not set" | Add the `TOKEN` script property (step 2.4). |
| "Missing tab" | Run `setupSheet` again, or tap **Set up Sheet** in the app's Settings. |
| App looks out of date after an update | Close and reopen it twice (the service worker updates in the background). |
| Dates turned into weird numbers in the Sheet | Run Set up Sheet (it sets every cell to plain text). |
