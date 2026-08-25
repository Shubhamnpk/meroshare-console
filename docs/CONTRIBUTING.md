# Contributing to MeroShare Console

Thanks for your interest in contributing! This guide covers everything you need to get
started.

## Project setup

1. Fork the repository and clone your fork:

   ```sh
   git clone https://github.com/<your-username>/meroshare-next.git
   cd meroshare-next
   ```

2. Install [Bun](https://bun.sh) 1.1+, then install dependencies:

   ```sh
   bun install
   ```

3. Create `.env.local` with a session secret (see the README's Getting Started section).

4. Start the dev server:

   ```sh
   bun run dev
   ```

## Before you open a PR

Run all three checks — CI runs exactly these on every pull request:

```sh
bun run lint          # ESLint + Prettier
bunx tsc --noEmit     # typecheck (the fees.test.ts vitest error is pre-existing, ignore it)
bun run build         # production build
```

## Ground rules

- **Never commit secrets.** No credentials, session tokens, DP details, or `.env` files.
  The app talks to a live financial backend — treat any account data as sensitive.
- Keep PRs focused: one feature or fix per PR.
- Match existing code style; the project uses Tailwind tokens (no hardcoded colors),
  Zod-validated server functions, and file-based routing.
- Test against real CDSC data where possible before submitting.

## Commit style

Use short, imperative commit messages (`fix portfolio refresh race`, `add RSI toggle to terminal chart`).

## Reporting issues

- **Bugs** → use the bug report template
- **Ideas** → use the feature request template
- **Security issues** → do NOT open a public issue. Use GitHub's private security advisory
  for this repository.

## License

By contributing you agree that your contributions will be licensed under the MIT License
that covers this project.
