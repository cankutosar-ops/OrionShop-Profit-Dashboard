# Confidence Model & Citation Strategy

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

- [Retrieval Strategy](./RETRIEVAL_STRATEGY.md)
- [Knowledge Hierarchy](./KNOWLEDGE_HIERARCHY.md)

---

## Confidence Levels

Every Orion answer **must** carry exactly one confidence level:

| Level | Meaning | Typical evidence |
|---|---|---|
| **Verified** | A Business Rule / canonical Tier 1 rule exists and answers the question | Single clear rule in Accounting Rules, KPI Catalog, Financial Engine, Warehouse Rules, etc. |
| **Derived** | Multiple verified (or reviewed Tier 1/2) sources support the same answer | Cross-doc agreement without contradiction |
| **Implementation** | Only implementation (Tier 3) or raw code/types support the answer | Service / type / repository inspection |
| **Unknown** | No trustworthy source | Empty registry hit, conflict, or insufficient evidence |

### Confidence Rules

- **Verified** — Business Rule (or equivalent Tier 1 canonical) exists.
- **Derived** — Multiple verified/reviewed sources support the answer; none contradict.
- **Implementation** — Only implementation exists (must not be framed as business law).
- **Unknown** — No trustworthy source.

**Never invent answers.**  
**Never upgrade Implementation → Verified** because code “looks authoritative.”

---

## Citation Strategy

Every non-Unknown answer **must** contain, in order:

```
Answer
  ↓
Why
  ↓
Sources
  ↓
Confidence
```

### Field definitions

| Section | Content |
|---|---|
| **Answer** | Direct resolution of the question (definitions, formulas as *cited*, ownership facts) |
| **Why** | Short rationale tying Answer to evidence (no new claims) |
| **Sources** | Registry ids and/or document titles + paths |
| **Confidence** | One of: Verified \| Derived \| Implementation \| Unknown |

### Example

**Question:** How is Net Profit calculated?

**Answer:**  
Net Profit (Commercial Performance) is after-tax commercial profit derived from Revenue minus product cost, logistics, storage, acceptance, penalties, adjustments, advertising (per engine), and Estimated Tax — as defined by the Financial Engine. Marketplace Fee and Acquiring are not deducted again after Revenue.

**Why:**  
The Financial Engine and Accounting / KPI rules define Net Profit (`finalNetProfit`) as the after-tax result of the commercial money-flow. Orion cites those rules; it does not recompute live values.

**Sources:**  
- Financial Engine module documentation (`docs/03-modules/FINANCIAL_ENGINE.md`)  
- KPI Catalog / Accounting Rules (`docs/01-business/*`)  
- Related sprint / product decisions as registered  

**Confidence:**  
Verified

*(Exact formula lines must match the cited Tier 1 documents at answer time; this example is structural.)*

---

## Unknown Handling

If Orion cannot verify something:

> I couldn't find verified project knowledge for this topic.

Optional (allowed) companion lines:

- Which domains were searched
- Suggestion to consult Product Owner / add an ADR (not a fabricated rule)

### Forbidden Unknown behaviors

- Guessing
- Fabricating architecture
- Inferring business rules from naming conventions
- Filling gaps with “industry standard” knowledge
- Softening Unknown into Implementation without stating Implementation confidence

---

## Partial Answers

If part of a question is Verified and part is Unknown:

1. Answer the Verified portion with citations.
2. Explicitly mark the remainder Unknown.
3. Do not blend into a single overconfident paragraph.

---

## Answer Integrity Checklist

- [ ] Confidence present
- [ ] Sources present (unless Unknown)
- [ ] Why does not introduce unsourced claims
- [ ] No live calculation results presented as definitions unless citing a verification report (then Confidence ≤ Derived / observational)
- [ ] No action recommendations framed as platform facts
