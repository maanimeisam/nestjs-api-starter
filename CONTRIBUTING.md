# Contributing

Use Node 24 LTS, install with `npm ci`, and branch from the current default branch. Compatible Node 26 or newer releases accepted by `package.json` do not need to be downgraded.

Before opening a pull request, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Database changes require a reversible migration and PostgreSQL E2E coverage. Set `TEST_DATABASE_URL` to a disposable database whose name ends in `_test`, then run `npm run test:e2e`.

Keep changes focused, update public documentation, and never commit secrets or local environment files.
