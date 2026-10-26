# Dev tools

No build step. These are only for local testing.

- `node tools/serve.mjs 8080` serves the app at http://localhost:8080 (refuses `seed/` and `.git/`).
- `node tools/mock-api.mjs 8787` runs the real `apps-script/Code.gs` against an in-memory fake Sheet. In the app's Settings use URL `http://localhost:8787/` and token `dev-token`, then **Set up Sheet**. `MOCK_DB=some/file.json` keeps the fake Sheet between runs (keep it outside the repo or under `seed/`).
- `node tools/make-icons.mjs` regenerates `icons/*.png`.

Both servers are also in `.claude/launch.json` (`app`, `mock-api`).
