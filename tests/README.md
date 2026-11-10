# Tests

Three layers, all runnable with no accounts and no access to the live club:

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | **Static** (every page's scripts parse, local files exist, editing keys are unique, script version tags match, every migration enables security, no private table is world-readable, email wording and Site Wording keys agree with the code that uses them) and **unit** (age rule, team matching, dropdown parsing) | Node 22 |
| `npm run test:e2e` | **Browser**: every page opens with no script errors (signed in and out, phone width), plus the flows that matter: Zeffy registration, live sections, Admin Teams, Emails, Site Look, Zeffy picker, Band Links, Credits import | `npm install` and Chromium |

The browser tests run the real pages against an in-memory stand-in for Supabase
(`tests/helpers/fakedb.js`); every request that isn't to the local test server is
answered with an empty body. If your machine already has Chromium, point at it with
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium`; otherwise `npx playwright install chromium`.

When a test fails it is usually pointing at something real (the first run found two
duplicate editing keys that made two blocks overwrite each other). Fix the cause rather
than the test. To add a check, put a `*.test.mjs` file in `tests/static`, `tests/unit` or
`tests/e2e`.

CI (`.github/workflows/tests.yml`) runs both commands on every pull request.
