# AI Hiring Radar

An MCP server that answers **"who is hiring, for what, and at what pay?"** from AI and developer-tool companies' own public career pages, so ChatGPT, Claude and other agents can answer with today's data instead of guessing.

> Independent portfolio project. Not affiliated with, endorsed by, or built for any company listed in it. Built with the open-source [mcp-use](https://github.com/mcp-use/mcp-use) SDK and deployed on Manufact Cloud.

## Tools

| Tool | Answers |
|---|---|
| `search_jobs` | "Which AI startups are hiring forward deployed engineers in SF?" Filters: role type, location, company, pay, remote, posted within N days. Sorts by newest, pay or company, with paging. |
| `hiring_overview` | "Which companies are hiring the most FDEs in the US?" Ranks companies by open roles, with pay counts and newest posting. |
| `search_company` | "What is this company hiring for?" Reads any one Ashby or Greenhouse board by name, even if the company is not on the tracked list. |
| `get_job` | One posting: pay, a short excerpt, skills it mentions, original link. |
| `compare_pay` | "What do FDE roles pay in New York, and who doesn't publish it?" |
| `skills_in_demand` | "What do these postings ask for most?" |
| `match_me` | "Here is my background. Which roles am I closest to and what am I missing?" |

Every result links to the company's own posting. Pay is only ever the range the company published; where there is none, the tools say so and never estimate.

## Where the data comes from

About 145 companies, read from the public job-board feeds that **Ashby** and **Greenhouse** publish so postings can be shown outside the company's own site. The list is in [`data/companies.json`](data/companies.json); each board was checked live on 2026-11-01.

- Ashby feeds include structured pay and full descriptions. Greenhouse feeds, as read here, include neither.
- Results are cached 15 minutes, requests are spaced out and capped, failed boards are reported rather than hidden, and Ashby postings marked unlisted are dropped.
- Descriptions are used for analysis only. Responses carry short excerpts and a link, never the full text.
- The server identifies itself with an honest `User-Agent` pointing at this repo.

**This is a demo, not a product.** Reading a public feed is not the same as having a licence to resell its contents. Turning this into a paid service would mean swapping in a licensed data source and checking each vendor's terms. The code would stay the same.

## Known limits

- Location matching is approximate (the feeds use free text). A bare "Remote" is not treated as US.
- `skills_in_demand` and `match_me` count keywords. They cannot tell required from nice-to-have.
- The first request after a cold start reads every board and can take several seconds. Later requests are served from cache.

## Develop

```bash
npm install
npm test          # 70+ tests, no network needed
npm run typecheck
npm run dev       # local server + Inspector
npm run build && npm start
```

Deploy by connecting this repo on Manufact Cloud. No environment variables or API keys are required.
