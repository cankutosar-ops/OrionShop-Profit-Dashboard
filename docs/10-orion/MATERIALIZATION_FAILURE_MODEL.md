# Materialization — Failure Model

---

Status

Draft

---

Owner

Platform Architecture

---

Module

Orion

---

Category

Architecture

---

Dependencies

- [Validation Model](./MATERIALIZATION_VALIDATION_MODEL.md)
- [Pipeline Stages](./MATERIALIZATION_PIPELINE_STAGES.md)

---

## Principle

Validation failures produce **deterministic diagnostics**.

- **No automatic fixes**
- **No silent corrections**
- **No partial Ready publish**

---

## Diagnostic Record

Every failure emits one or more diagnostics:

| Field | Description |
|---|---|
| `run_id` | Materialization run identifier |
| `object_id` | Knowledge ID (if known) |
| `stage` | Stage name (Validation, Authority, …) |
| `rule_id` | e.g. `VAL-ID-UNIQUE`, `AUTH-HIERARCHY` |
| `severity` | `error` (blocks) \| `warning` (non-blocking; warnings alone do not grant Ready if errors exist) |
| `message` | Human-readable, deterministic text |
| `path` | Field/edge path if applicable |
| `expected` / `actual` | Optional structured detail |

---

## Severity Policy

| severity | Effect |
|---|---|
| `error` | Halt pipeline for that object (and fail atomic batch) |
| `warning` | Recorded; does not by itself make Ready; policy may require zero warnings for Ready |

Default: **Ready requires zero errors**. Warnings policy is configurable later without redesign.

---

## Operator Actions

On failure, humans (or future draft tools) must:

1. Read diagnostics
2. Edit the Knowledge Object
3. Re-run the pipeline from the start

The pipeline never mutates the object to “make it pass.”

---

## Forbidden Behaviors

- Auto-renaming IDs to resolve collisions
- Auto-dropping broken relationships
- Auto-upgrading confidence
- Auto-inserting Business Rule citations
- Swallowing errors as warnings

---

## AI-Generated Drafts (Future)

AI may propose **draft** objects. Drafts still enter the **same** pipeline. AI output that fails validation stays non-Ready. No special bypass.
