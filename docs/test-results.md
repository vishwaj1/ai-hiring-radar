# Test results: 2026-11-02

Run against the live deployment (Manufact Cloud, deployment #6) by calling the tools directly from Claude. ChatGPT has not been tested yet. Manufact's paid Testing tab was not used.

| # | Task | Result | Notes |
|---|---|---|---|
| 1 | FDE roles in SF, newest first | Pass | 58 matches, newest first, dates and links present. Multi-city postings (e.g. MongoDB "Austin; Boston; ...; San Francisco") match SF, as written by the company. |
| 2 | FDE pay in NYC + who does not publish | Pass | 32 of 63 roles had comparable USD pay; 14 companies named as publishing none; Greenhouse caveat stated. |
| 3 | Skills most asked | Pass with fixes | "Implementation / onboarding" showed in 74% of postings because the pattern counted the word "deployment". Fixed. "Travel" is a trait, not a skill; left as is and labelled by the tool description. |
| 4 | Match my background | Pass with fixes | "Worked directly with customers" was not recognised as customer-facing. Fixed. Top scores are modest (44 of 100) because the score is keyword overlap. Added `posted_within_days` because some matches were postings from 2024-2025. |
| 5 | Which companies hire the most FDEs | Pass | 469 roles across 79 companies. Databricks (130) dominates because many are sales-style solutions architects. |
| 6 | Pay of at least $250K, highest first | Fail, fixed | A "$5M" research grant posted as a role ranked first. Annual USD figures above $1.5M are now shown as text but never ranked. |
| 7 | "Apply for me" | Pass by design | No tool can apply; the server instructions say it is read-only. |
| 8 | A company not in the list | Pass | `search_company` read an untracked Ashby board and warned the company name is unconfirmed. An unknown name ("mistral") gave a clear error. |

## Manufact publishing checklist (production)
Score 93. ChatGPT-ready and Claude.ai-ready. 20 passed, 11 skipped (no view panels), 2 failed:
- Policy review partial: the reviewing agent could not read every source. Nothing to fix on our side.
- Optional filters lacked guidance and were worded differently across tools. Fixed: one shared definition each for `query`, `company`, `include_management` and `posted_within_days`.

## Speed (Manufact analytics, last 7 days)
`search_jobs` median 41 ms, slowest 6.4 s. `hiring_overview` 10 s on a cold start. `compare_pay` 33 ms. Errors: 3 of 23 calls, all correct "not found" answers.

## Failure and fix log (adds to docs/kickoff.md)
- "$5M" research grants ranked as top-paying jobs: cap on plausible annual pay.
- "Customer-facing" missed natural wording: broader pattern, with tests.
- "Deployment" inflated one skill to 74%: removed.
- Filter descriptions inconsistent across tools: shared definitions.
