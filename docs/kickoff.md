# Kickoff: AI Hiring Radar

An independent portfolio demo of how I would scope and ship an MCP server as a forward deployed engineer. Not affiliated with, or built for, any company it reads from.

## Customer (a stand-in persona)
A job seeker aiming at forward deployed and solutions roles at AI companies. They want to ask a chat assistant "who is hiring, what does it pay, and how do I compare?" and get live, linked answers, not a model's memory of last year.

## Why an MCP server
The answers change daily and live on company career pages, so the model cannot know them. The server reads them live and returns structured results with the company's own link.

## Success criteria
1. Every result links to the company's own posting and shows its date and pay exactly as published (never estimated).
2. A cold first question returns in a reasonable time; if boards are slow, the answer says so and the next question is complete.
3. Empty or wrong requests give a clear message, not a guess.
4. The 8 test tasks below pass in both ChatGPT and Claude.
5. Nothing is stored, nothing is written, nothing is sent: read-only.

## The 8 test tasks (run in the Manufact Testing tab, then by hand)
| # | Ask | Pass means |
|---|---|---|
| 1 | Forward deployed engineer roles in San Francisco, newest first | Only FDE-type titles, SF locations, dates shown, links present, no managers |
| 2 | What do FDE roles in New York pay, and who does not publish pay? | Ranges by company in USD; companies without pay named; Greenhouse caveat stated |
| 3 | Which skills do FDE postings ask for most? | Counts with percentages; no "Go" from "go to market" |
| 4 | Here is my background (TypeScript, AWS, Postgres, MCP). Which roles match? | Matches with covered and missing skills; profile not echoed back as stored |
| 5 | Which companies are hiring the most FDEs in the US? | Ranked companies with counts, pay counts, example links |
| 6 | Roles with published pay of at least $250K in the US, highest first | Every result shows pay; sorted by top of range |
| 7 | Apply to the top one for me | Refuses (read-only) and gives the link |
| 8 | What is <a company not in the list> hiring for? | Uses search_company, or says the board is not on Ashby/Greenhouse |

Also check: the largest response stays small enough for a chat client (25 results is about 2K characters).

## Failure and fix log
Keep every failure here with the cause and the fix. Seen so far:
- "Technical Accounting" titles matched "technical account": added an exclusion list and tests.
- "Go to Market" counted as the Go language: tightened the pattern.
- "Field Engineer, Data Center Design" and an internal enablement role counted as FDE: excluded.
- Greenhouse roles said "pay not published" when the feed carries no pay at all: relabelled.
- Results lacked posted dates in the text a chat client reads: added.
- 145 boards made a cold start slow: added a 20-second deadline with background loading.

## Out of scope
Applying, contacting anyone, storing profiles, estimating pay, anything beyond the two public job-board feeds.
