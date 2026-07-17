# Project Log

Lightweight development history for OrionShop Profit Dashboard.

## Purpose

The Project Log records **important business and technical decisions** as work progresses.

It is intentionally short and cheap to maintain. Each completed sprint gets one small entry. The goal is continuity of intent — why the system looks the way it does — not a mirror of the codebase.

## Project Log vs Project DNA

| | Project Log | Project DNA |
|---|---|---|
| **When** | Continuously during development | After core modules are complete |
| **What** | Short sprint entries: decisions, scope, notes | Final architecture documentation |
| **How** | Append only — never rewrite history | Generated once from the log + codebase |
| **Audience** | Active development / handoff | Long-term reference |

**Project Log** = lightweight development history.

**Project DNA** = final architecture documentation generated after core development is complete.

Do **not** create or regenerate Project DNA until the core modules are finished.

## Project Log vs code comments

| | Project Log | Code comments |
|---|---|---|
| **Scope** | Cross-cutting business and architecture choices | Local intent next to implementation |
| **Lifetime** | Sprint-level history | Lives with the code |
| **Content** | Decisions, trade-offs, what was accepted | How a function or module works |

Code comments explain *how this file behaves*. The Project Log explains *what we decided and why* at the product/architecture level.

Do not duplicate implementation detail that already exists in source. Point to modules or sprints when needed; keep entries under ~15–20 lines.

## Location

- `CHANGELOG.md` — append-only sprint entries
- This `README.md` — workflow and conventions

## Workflow (mandatory)

After every completed sprint:

1. Append **one** new sprint section to `CHANGELOG.md`.
2. Use the template in `CHANGELOG.md`.
3. Do **not** rewrite previous entries.
4. Do **not** regenerate the entire documentation set.
5. Do **not** expand this into Project DNA until core development is complete.
