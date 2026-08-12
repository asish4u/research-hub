# scripts/

Utility scripts for the Research Hub project.

| File | Purpose | When to use |
|------|---------|-------------|
| `check.mjs` | Validates the inline JavaScript inside `public/index.html` | After any HTML/JS edit — run `npm run check` |

## legacy/

Historical one-off scripts used to build the current `public/index.html`
(archive updates, theme toggle, layout fixes, link repairs). They have
been kept for reference only — their changes are already applied. Do not
run them against the live site; edit `public/index.html` directly.
