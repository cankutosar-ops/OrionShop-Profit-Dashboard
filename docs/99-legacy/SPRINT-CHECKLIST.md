# Sprint End Checklist

Run this at the end of every sprint before merging or tagging.

## 1. Git commit

One commit (or a small, logical series) that closes the sprint:

```bash
git status
git diff
git log -3 --oneline

git add <relevant files>
git commit -m "$(cat <<'EOF'
Sprint N: short summary of the sprint goal.

EOF
)"
```

**Rules**

- Do not commit `.env.local`, credentials, or secrets
- Migration SQL files belong in the commit
- `CHANGELOG.md` update belongs in the same commit (or immediately after)

## 2. Migration number

Every schema change gets one file:

```
supabase/migrations/YYYYMMDDHHMMSS_snake_case_description.sql
```

- Timestamp must be unique and monotonically increasing
- Record the filename in `CHANGELOG.md` under **Migration**
- Apply via Supabase SQL Editor (service role cannot run DDL from the app)

## 3. CHANGELOG.md

Add a section at the top (below the format guide), following this template:

```markdown
## Sprint N — v0.N.0 (YYYY-MM-DD)

### Added
- …

### Changed
- …

### Fixed
- …

### Migration
- `20260627120000_example.sql`
```

**Version rule:** Sprint N → `v0.N.0` (update `package.json` `"version"` when you tag or release).

## Quick reference

| Sprint | Version   | Theme                          |
|--------|-----------|--------------------------------|
| 1      | v0.1.0    | Dashboard + WB sync foundation |
| 2      | v0.2.0    | SKU / stock infrastructure     |
| 3      | v0.3.0    | Company & marketplace accounts |
| 4      | v0.4.0    | Inventory module (planned)     |

## Optional (when releasing)

```bash
# After commit, if tagging:
git tag v0.3.0
git push origin HEAD --tags
```
