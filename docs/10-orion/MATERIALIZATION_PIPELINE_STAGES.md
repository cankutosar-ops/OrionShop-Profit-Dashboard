# Materialization Pipeline — Stages

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

- [Knowledge Materialization Pipeline](./KNOWLEDGE_MATERIALIZATION_PIPELINE.md)
- [Validation Model](./MATERIALIZATION_VALIDATION_MODEL.md)

---

## Stage Contracts

Each stage has: **Input**, **Checks**, **Output**, **On failure**.

---

### 0. Ingress

| | |
|---|---|
| **Input** | Candidate Knowledge Object (draft or updated) |
| **Checks** | Object is parseable against Knowledge Object schema |
| **Output** | Candidate accepted for Validation |
| **On failure** | Reject — schema diagnostic |

---

### 1. Validation (structural)

| | |
|---|---|
| **Input** | Candidate object |
| **Checks** | Required fields, enums, lifecycle/confidence consistency (see Validation Model) |
| **Output** | Structurally valid object |
| **On failure** | Halt — list all structural violations |

---

### 2. Authority Validation

| | |
|---|---|
| **Input** | Structurally valid object |
| **Checks** | Source kinds present; hierarchy respected; calculation objects not `authority_level: implementation` when claiming Verified |
| **Output** | Authority-valid object |
| **On failure** | Halt — authority diagnostics |

---

### 3. Relationship Validation

| | |
|---|---|
| **Input** | Authority-valid object |
| **Checks** | Every `target_id` exists (in candidate set or already-Ready registry); no broken refs; relationship types valid; no circular ownership |
| **Output** | Graph-valid object |
| **On failure** | Halt — relationship diagnostics |

**Note:** First-time bootstrap may validate against a closed candidate batch (transactional set) so mutual references can pass together.

---

### 4. Ownership Validation

| | |
|---|---|
| **Input** | Graph-valid object |
| **Checks** | `owner` present; `business_owner` / `technical_owner` present; calculation/definition objects have FE/Product business ownership rules satisfied |
| **Output** | Ownership-valid object |
| **On failure** | Halt |

---

### 5. Knowledge ID Validation

| | |
|---|---|
| **Input** | Ownership-valid object |
| **Checks** | ID matches `<PREFIX>-<NNN>`; prefix registered; ID unique across Ready + in-flight batch; ID not reused from superseded/archived under different meaning |
| **Output** | Identity-valid object |
| **On failure** | Halt |

---

### 6. Version Validation

| | |
|---|---|
| **Input** | Identity-valid object |
| **Checks** | `version` present; if updating existing Ready object, version must increase; `superseded` requires `superseded_by`; historical id immutability |
| **Output** | Version-valid object |
| **On failure** | Halt |

---

### 7. Registry Registration

| | |
|---|---|
| **Input** | Fully validated object |
| **Checks** | Registry accepts **only** validated objects; write registry entry derived from object |
| **Output** | Registered knowledge asset (registry record) |
| **On failure** | Halt — object not Ready; no partial publish |

---

### 8. Representation Generation

| | |
|---|---|
| **Input** | Registered object |
| **Checks** | Generate declared channel outputs from object (article, tooltip, …); outputs must not contradict object |
| **Output** | Representation artifacts (files/records) |
| **On failure** | Halt or mark representations incomplete — object must not be Ready until required channels succeed (channel policy) |

---

### 9. Index Generation

| | |
|---|---|
| **Input** | Registered object + representations |
| **Checks** | Update/rebuild indexes (module, category, owner, tags, …) |
| **Output** | Index entries |
| **On failure** | Halt — not Ready |

---

### 10. Ready for Retrieval

| | |
|---|---|
| **Input** | Registered + indexed asset |
| **Checks** | `lifecycle` publishable (`verified` or allowed deprecated with notice); all mandatory stages passed |
| **Output** | **Ready** flag / state — eligible for future Orion retrieval |
| **On failure** | Remains non-Ready |

---

## Ordering Invariant

Stages **1→10** run in order. Later stages must not re-admit a failed earlier stage without a full re-run from Validation.
