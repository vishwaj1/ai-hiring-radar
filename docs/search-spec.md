# How search works

This is the contract for `search_jobs`. Every rule below has a test in `test/`.

## What is searched
Open roles from the public Ashby and Greenhouse job-board feeds of the companies in `data/companies.json`, read live (cached up to 15 minutes). Roles Ashby marks as unlisted are dropped. The response always says how many open roles were scanned, how many boards loaded, and which could not be read.

## Filters (all combine with AND)
| Input | Meaning |
|---|---|
| `query` | Every word must appear in the title, department or company name (case-insensitive). Descriptions are not searched. |
| `role_family` | `forward_deployed`: title says forward deployed, deployment engineer/engineering/strategist/lead/manager, or field engineer. `solutions`: solutions engineer/architect/consultant, customer engineer. `fde_or_solutions`: either. `any`: no title filter. Titles about accounting, recruiting, data centers or enablement are never matched. |
| `location` | Free text. `US` means a US state, city or country marker. Aliases: SF, bay area, NYC, LA, DC, UK, EMEA, APAC. Use `a or b` for alternatives. A role's location is whatever text the company wrote, so odd spellings can be missed. |
| `company` | Partial company name. |
| `has_pay` | Only roles with a published pay range. |
| `min_salary_usd` | Only roles with a USD yearly range whose top end is at least this. Other currencies and hourly pay never match. |
| `include_management` | Default **false**: titles with manager, director, head of, VP, vice president, chief are dropped. |
| `remote_only` | Company flags it remote, or the location text contains the word "remote". |
| `posted_within_days` | First published within N days. Roles with no publish date are dropped. |

## Order and paging
`sort_by`: `newest` (default), `pay_high` (highest USD top-of-range first, roles without comparable pay last), `company` (A to Z). Ties always break on newest, then id, so the order does not change between calls. `limit` (1-25) sets the page size. `next_offset` in the reply is the `offset` for the next page, or null at the end.

## Pay
`pay` is the exact text the company published. Null means none in the feed, never an estimate. Greenhouse feeds carry no pay, so those roles are described as "pay not in this feed, see posting".

## Known limits
- Only the tracked companies are searched. Add one by editing `data/companies.json`.
- Role family is decided from the title alone.
- Location matching is text matching, not geography.

## Other tools
- `hiring_overview`: companies ranked by number of open roles that match a role type, place and optional recency. Same title rules and filters as `search_jobs`; ties break on company name. Shows how many of each company's roles publish pay.
- `search_company`: reads one Ashby or Greenhouse board by its board name, for companies not in the tracked list. Only the two job-board hosts are contacted, and board names are restricted to letters, digits, dots, dashes and underscores. The feeds do not state the company name, so the user must confirm it is the company they mean. Companies on Lever, Workday and other systems cannot be read.

## Slow starts
The first search after the server wakes reads every board. If that takes longer than 20 seconds, the reply uses the boards that have answered, says how many are still loading, and those keep loading so a repeat question is complete. Boards that fail are reported by name and retried on the next call.
