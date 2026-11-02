import { MCPServer } from "mcp-use";
import { z } from "zod";
import { COMPANIES } from "./companies.ts";
import { createStore, type LoadResult } from "./store.ts";
import { filterJobs, sortJobs, sortNewest, type Filters } from "./filter.ts";
import { buildPayReport } from "./pay.ts";
import { buildHiringOverview } from "./overview.ts";
import { countSkills, extractSkills, skillsForJob } from "./skills.ts";
import { scoreMatch } from "./match.ts";
import { excerpt } from "./text.ts";
import type { Job } from "./types.ts";

const REPO_URL = "https://github.com/vishwaj1/ai-hiring-radar";

const server = new MCPServer({
  name: "ai-hiring-radar",
  version: "0.1.0",
  description:
    "Open roles at AI and developer-tool companies, read live from their own career pages: search, published pay, skills in demand, and how your background matches.",
  websiteUrl: REPO_URL,
  instructions: [
    "Use search_jobs to list open roles, hiring_overview to see which companies are hiring most for a role, search_company to read any one company's board that is not in the tracked list, get_job for one posting, compare_pay for salaries, skills_in_demand for what employers ask for, and match_me to compare a person's background to open roles.",
    "Always give the user the posting `url`. It is the company's own page.",
    "`pay` is the range the company published. Null means not published: never estimate or guess a number.",
    "Companies hosted on Greenhouse expose neither pay nor full descriptions in this feed. Say so when it affects an answer.",
    "This server only reads. It cannot apply to jobs, contact anyone, or save anything.",
  ].join(" "),
});

// Nothing touches the network at import time: `mcp-use build` evaluates this file.
const store = createStore({ companies: COMPANIES });

// ---------- shared shapes ----------

const FamilySchema = z
  .enum(["any", "forward_deployed", "solutions", "fde_or_solutions"])
  .describe(
    "Role type. forward_deployed = forward deployed / deployment / field engineer titles. solutions = solutions engineer / architect. fde_or_solutions = either. any = no role filter.",
  );

const LocationSchema = z
  .string()
  .optional()
  .describe(
    'Where the role is. Free text from each company, so matching is approximate. Accepts "US", "SF", "NYC", "bay area", "London", "EMEA", "APAC", or alternatives with "or". A bare "Remote" is not treated as US.',
  );

// One definition per shared filter, so every tool describes it the same way.
const QuerySchema = z
  .string()
  .optional()
  .describe(
    "Keywords. Every word must appear (case-insensitive) in the role's title, department or company name. Job descriptions are not searched. Example: 'infrastructure'.",
  );

const CompanySchema = z
  .string()
  .optional()
  .describe(
    "Only this company. Partial, case-insensitive match on the company name, e.g. 'cursor'. A name that matches no tracked company returns an error; use search_company for companies outside the tracked list.",
  );

const IncludeManagementSchema = z
  .boolean()
  .default(false)
  .describe(
    "Default false: titles containing manager, director, head of, VP, vice president or chief are left out. Set true to include them.",
  );

const PostedWithinDaysSchema = z
  .number()
  .int()
  .min(1)
  .max(365)
  .optional()
  .describe(
    "Only roles first published within this many days. Roles with no publish date are dropped, so the result can be smaller than the number of open roles.",
  );

const JobCard = z.object({
  id: z.string().describe("Stable id. Pass to get_job."),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  department: z.string().nullable(),
  pay: z
    .string()
    .nullable()
    .describe("Pay range exactly as the company published it. Null when not published."),
  published: z.string().nullable().describe("ISO date the posting went live. Ashby companies only."),
  updated: z.string().nullable().describe("ISO date the posting was last updated. Greenhouse companies only."),
  url: z.string().describe("The company's own posting page. Always link to this."),
  source: z.enum(["ashby", "greenhouse"]),
});
type Card = z.infer<typeof JobCard>;

function toCard(job: Job): Card {
  return {
    id: job.id,
    company: job.company,
    title: job.title,
    location: job.location,
    department: job.department,
    pay: job.payText,
    published: job.publishedAt,
    updated: job.updatedAt,
    url: job.url,
    source: job.source,
  };
}

function describeJob(c: Card, n: number): string {
  const noPay = c.source === "greenhouse" ? "pay not in this feed, see posting" : "pay not published";
  const when = c.published ? `posted ${c.published.slice(0, 10)}` : c.updated ? `updated ${c.updated.slice(0, 10)}` : "date not in feed";
  const bits = [c.location, c.pay ?? noPay, when].join(" · ");
  return `${n}. **${c.company}**: ${c.title} (${bits}) ${c.url}`;
}

function dataNote(r: LoadResult): string {
  const ageMin = r.oldestFetchAt === null ? 0 : Math.max(0, Math.round((Date.now() - r.oldestFetchAt) / 60_000));
  const parts = [`Read live from companies' own career-page feeds (${r.loaded} of ${r.requested} boards, up to ${ageMin} min old)`];
  if (r.pending.length > 0) {
    parts.push(`${r.pending.length} slower board${r.pending.length === 1 ? " is" : "s are"} still loading (${r.pending.slice(0, 6).join(", ")}${r.pending.length > 6 ? ", ..." : ""}), so this list is incomplete: ask again in a moment for the full picture`);
  }
  if (r.failed.length > 0) {
    const names = r.failed.map((f) => f.company);
    parts.push(`could not read: ${names.slice(0, 8).join(", ")}${names.length > 8 ? ` and ${names.length - 8} more` : ""}`);
  }
  parts.push("confirm details on the original posting before acting");
  return `${parts.join("; ")}.`;
}

const ok = <T extends Record<string, unknown>>(text: string, data: T) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: data,
});
const fail = (text: string) => ({ isError: true as const, content: [{ type: "text" as const, text }] });

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

/** Answer with what has loaded by this point; slower boards keep loading for the next call. */
const LOAD_DEADLINE_MS = 20_000;

async function load(company?: string): Promise<{ result: LoadResult } | { error: string }> {
  const targets = company ? store.companiesMatching(company) : store.companies;
  if (targets.length === 0) {
    return { error: `No tracked company matches "${company}". Read the radar://companies resource for the list.` };
  }
  const result = await store.loadJobs(targets, { deadlineMs: LOAD_DEADLINE_MS });
  if (result.loaded === 0 && result.pending.length === 0) {
    return { error: `Could not read any career pages right now (${result.failed.map((f) => f.error).join("; ")}). Try again shortly.` };
  }
  return { result };
}

// ---------- search_jobs ----------

const SearchOut = z.object({
  total_matches: z.number().int(),
  returned: z.number().int(),
  offset: z.number().int(),
  next_offset: z.number().int().nullable().describe("Pass as `offset` to get the next page. Null when there are no more."),
  roles_scanned: z.number().int().describe("Open roles read before filtering."),
  jobs: z.array(JobCard),
  data_note: z.string(),
});

server.tool(
  {
    name: "search_jobs",
    title: "Search open roles",
    description:
      "Find currently open roles at about 145 AI, developer-tool and infrastructure companies, read live from their own career pages. Use for questions like 'who is hiring forward deployed engineers in New York' or 'roles paying over $250K'. Returns newest first, each with the company's original link and its published pay when it has one. Does not apply to jobs.",
    inputSchema: z.object({
      query: QuerySchema,
      role_family: FamilySchema.default("any"),
      location: LocationSchema,
      company: CompanySchema,
      has_pay: z.boolean().optional().describe("Only roles where the company published a pay range."),
      min_salary_usd: z.number().int().positive().optional().describe("Only roles whose published USD yearly range reaches at least this figure at the top end."),
      include_management: IncludeManagementSchema,
      remote_only: z.boolean().optional().describe("Only roles marked remote by the company or with 'remote' in the location."),
      posted_within_days: PostedWithinDaysSchema,
      sort_by: z.enum(["newest", "pay_high", "company"]).default("newest").describe("newest: latest first. pay_high: highest published USD top-of-range first, roles without comparable pay last. company: A to Z."),
      limit: z.number().int().min(1).max(25).default(10).describe("How many to return per page."),
      offset: z.number().int().min(0).default(0).describe("Skip this many results. Use next_offset from the previous page."),
    }),
    outputSchema: SearchOut,
    annotations: READ_ONLY,
  },
  async (input) => {
    const loaded = await load(input.company);
    if ("error" in loaded) return fail(loaded.error);
    const filters: Filters = {
      query: input.query,
      family: input.role_family,
      location: input.location,
      hasPay: input.has_pay,
      minSalaryUsd: input.min_salary_usd,
      includeManagement: input.include_management,
      remoteOnly: input.remote_only,
      postedWithinDays: input.posted_within_days,
    };
    const matches = sortJobs(filterJobs(loaded.result.jobs, filters), input.sort_by);
    const scanned = loaded.result.jobs.length;
    const cards = matches.slice(input.offset, input.offset + input.limit).map(toCard);
    const end = input.offset + cards.length;
    const nextOffset = end < matches.length ? end : null;
    const note = dataNote(loaded.result);
    const order = { newest: "newest first", pay_high: "highest published pay first", company: "A to Z by company" }[input.sort_by];
    const text =
      cards.length === 0
        ? `No open roles matched${input.offset > 0 ? " on this page" : ""} (${matches.length} total from ${scanned} open roles scanned). ${note}`
        : `${matches.length} matching roles out of ${scanned} open roles scanned (showing ${input.offset + 1}-${end}, ${order})\n${cards.map((c, i) => describeJob(c, input.offset + i + 1)).join("\n")}\n${nextOffset === null ? "" : `\nMore results: call again with offset=${nextOffset}.\n`}\n${note}`;
    return ok(text, { total_matches: matches.length, returned: cards.length, offset: input.offset, next_offset: nextOffset, roles_scanned: scanned, jobs: cards, data_note: note });
  },
);

// ---------- get_job ----------

const GetJobOut = z.object({
  job: JobCard,
  employment_type: z.string().nullable(),
  remote: z.boolean().nullable(),
  description_excerpt: z.string().nullable().describe("Short lead-in only. The full description is on the original posting."),
  skills_mentioned: z.array(z.string()),
  data_note: z.string(),
});

server.tool(
  {
    name: "get_job",
    title: "Get one role",
    description:
      "Details for one posting by id (from search_jobs): pay if published, a short excerpt of the description, skills it mentions, and the original link. Gives a lead-in only, not the full description.",
    inputSchema: z.object({ id: z.string().describe("The `id` from a search_jobs result.") }),
    outputSchema: GetJobOut,
    annotations: READ_ONLY,
  },
  async ({ id }) => {
    const job = await store.findJob(id);
    if (!job) return fail("No posting with that id. Ids come from search_jobs, and a posting may have closed since.");
    let description: string | null = null;
    let note = "Details read live from the company's own career page; confirm on the original posting.";
    try {
      description = await store.getDescription(job);
    } catch {
      note += " The description could not be fetched just now.";
    }
    const card = toCard(job);
    const skills = description ? extractSkills(`${job.title}\n${description}`) : [];
    const lead = description ? excerpt(description, 700) : null;
    const text = [
      describeJob(card, 1),
      lead ? `\n${lead}` : "\n(No description available in this feed.)",
      skills.length ? `\nSkills mentioned: ${skills.join(", ")}` : "",
      `\n${note}`,
    ].join("");
    return ok(text, {
      job: card,
      employment_type: job.employmentType,
      remote: job.remote,
      description_excerpt: lead,
      skills_mentioned: skills,
      data_note: note,
    });
  },
);

// ---------- compare_pay ----------

const ComparePayOut = z.object({
  matching_roles: z.number().int(),
  roles_with_comparable_pay: z.number().int(),
  median_midpoint_usd: z.number().nullable(),
  by_company: z.array(
    z.object({
      company: z.string(),
      roles_with_pay: z.number().int(),
      min_usd: z.number(),
      max_usd: z.number(),
      highest_paying_title: z.string(),
      url: z.string(),
    }),
  ),
  companies_without_published_pay: z.array(z.object({ company: z.string(), roles: z.number().int() })),
  excluded_non_usd_or_non_yearly: z.number().int(),
  caveat: z.string(),
  data_note: z.string(),
});

const PAY_CAVEAT =
  "Ranges are what each company published for that posting. Some include bonus or commission and some list several location tiers. In the feed this server reads, Greenhouse postings carry no pay field, so those companies appear under companies_without_published_pay whatever they actually pay.";

server.tool(
  {
    name: "compare_pay",
    title: "Compare published pay",
    description:
      "Compare the salary ranges companies have published for a type of role, by company, in US dollars per year. Also lists which matching companies publish no pay at all. Use for 'what do FDE roles pay in New York'. Never estimates: only reports published figures.",
    inputSchema: z.object({
      role_family: FamilySchema.default("forward_deployed"),
      query: QuerySchema,
      location: LocationSchema,
      company: CompanySchema,
      include_management: IncludeManagementSchema,
    }),
    outputSchema: ComparePayOut,
    annotations: READ_ONLY,
  },
  async (input) => {
    const loaded = await load(input.company);
    if ("error" in loaded) return fail(loaded.error);
    const matches = filterJobs(loaded.result.jobs, {
      query: input.query,
      family: input.role_family,
      location: input.location,
      includeManagement: input.include_management,
    });
    const report = buildPayReport(matches);
    const note = dataNote(loaded.result);
    const byCompany = report.rows.slice(0, 15).map((r) => ({
      company: r.company,
      roles_with_pay: r.jobsWithPay,
      min_usd: r.min,
      max_usd: r.max,
      highest_paying_title: r.exampleTitle,
      url: r.exampleUrl,
    }));
    const noPay = report.noPayCompanies.slice(0, 15).map((c) => ({ company: c.company, roles: c.jobs }));
    const usd = (n: number) => `$${Math.round(n / 1000)}K`;
    const lines = byCompany.map((r) => `- **${r.company}**: ${usd(r.min_usd)} to ${usd(r.max_usd)} (${r.roles_with_pay} role${r.roles_with_pay === 1 ? "" : "s"}; top: ${r.highest_paying_title}) ${r.url}`);
    const text =
      matches.length === 0
        ? `No matching roles. ${note}`
        : [
            `${matches.length} matching roles; ${report.comparableJobs} publish a comparable USD yearly range${report.medianMidpoint !== null ? ` (median midpoint ${usd(report.medianMidpoint)})` : ""}.`,
            ...lines,
            noPay.length ? `\nNo published pay: ${noPay.map((c) => `${c.company} (${c.roles})`).join(", ")}.` : "",
            `\n${PAY_CAVEAT}`,
            note,
          ].join("\n");
    return ok(text, {
      matching_roles: matches.length,
      roles_with_comparable_pay: report.comparableJobs,
      median_midpoint_usd: report.medianMidpoint,
      by_company: byCompany,
      companies_without_published_pay: noPay,
      excluded_non_usd_or_non_yearly: report.excludedJobs,
      caveat: PAY_CAVEAT,
      data_note: note,
    });
  },
);

// ---------- skills_in_demand ----------

const SkillsOut = z.object({
  matching_roles: z.number().int(),
  roles_analysed: z.number().int().describe("Matching roles whose description is available in the feed (Ashby companies only)."),
  skills: z.array(z.object({ skill: z.string(), roles: z.number().int(), share: z.number().describe("0 to 1") })),
  caveat: z.string(),
  data_note: z.string(),
});

const SKILLS_CAVEAT =
  "Keyword counts over job descriptions, so it cannot tell required from nice-to-have and picks up company boilerplate. Only Ashby-hosted companies expose descriptions in this feed; Greenhouse-hosted ones are not counted.";

server.tool(
  {
    name: "skills_in_demand",
    title: "Skills in demand",
    description:
      "Count which skills, tools and traits appear most often in the descriptions of matching open roles, e.g. what forward deployed engineer postings ask for. Reports how many postings were analysed.",
    inputSchema: z.object({
      role_family: FamilySchema.default("forward_deployed"),
      query: QuerySchema,
      location: LocationSchema,
      company: CompanySchema,
      include_management: IncludeManagementSchema,
      top_n: z.number().int().min(1).max(25).default(12),
    }),
    outputSchema: SkillsOut,
    annotations: READ_ONLY,
  },
  async (input) => {
    const loaded = await load(input.company);
    if ("error" in loaded) return fail(loaded.error);
    const matches = filterJobs(loaded.result.jobs, {
      query: input.query,
      family: input.role_family,
      location: input.location,
      includeManagement: input.include_management,
    });
    const { counts, sampleSize } = countSkills(matches);
    const top = counts.slice(0, input.top_n).map((c) => ({ skill: c.skill, roles: c.jobs, share: c.share }));
    const note = dataNote(loaded.result);
    const text =
      sampleSize === 0
        ? `${matches.length} matching roles, but none have a description available to analyse. ${SKILLS_CAVEAT}`
        : [
            `Across ${sampleSize} postings with descriptions (of ${matches.length} matching):`,
            ...top.map((s) => `- ${s.skill}: ${s.roles} (${Math.round(s.share * 100)}%)`),
            `\n${SKILLS_CAVEAT}`,
            note,
          ].join("\n");
    return ok(text, { matching_roles: matches.length, roles_analysed: sampleSize, skills: top, caveat: SKILLS_CAVEAT, data_note: note });
  },
);

// ---------- match_me ----------

const MatchOut = z.object({
  skills_detected_in_profile: z.array(z.string()),
  roles_considered: z.number().int(),
  matches: z.array(
    z.object({
      job: JobCard,
      score: z.number().int().describe("0 to 100. A keyword overlap measure, not a hiring prediction."),
      matched_skills: z.array(z.string()),
      missing_skills: z.array(z.string()).describe("Skills the posting mentions that the profile does not."),
    }),
  ),
  caveat: z.string(),
  data_note: z.string(),
});

const MATCH_CAVEAT =
  "Keyword overlap between your text and each posting, so it misses skills you did not write down and cannot judge seniority or fit. Only Ashby-hosted companies expose descriptions in this feed. The profile text is used for this request only and is not stored or logged.";

server.tool(
  {
    name: "match_me",
    title: "Match my background",
    description:
      "Rank open roles by keyword overlap with a short summary of the user's skills and experience, and list what each role asks for that the summary does not mention. Ask for a skills summary only, never a full resume or contact details. Use when someone describes their experience and asks which roles fit or what they are missing.",
    inputSchema: z.object({
      profile: z
        .string()
        .min(20)
        .max(3000)
        .describe(
          "A short summary of the person's skills, tools and kinds of work, e.g. 'Five years of TypeScript and AWS; built customer-facing integrations'. Leave out name, contact details, addresses and employer names: only skill keywords are used.",
        ),
      role_family: FamilySchema.default("any"),
      location: LocationSchema,
      include_management: IncludeManagementSchema,
      posted_within_days: PostedWithinDaysSchema,
      limit: z.number().int().min(1).max(10).default(5),
    }),
    outputSchema: MatchOut,
    annotations: READ_ONLY,
  },
  async (input) => {
    const profileSkills = extractSkills(input.profile);
    if (profileSkills.length === 0) {
      return fail("No recognisable skills found in that text. Add the tools, languages and kinds of work you have done.");
    }
    const loaded = await load();
    if ("error" in loaded) return fail(loaded.error);
    const profile = new Set(profileSkills);
    const candidates = filterJobs(loaded.result.jobs, {
      family: input.role_family,
      location: input.location,
      includeManagement: input.include_management,
      postedWithinDays: input.posted_within_days,
    }).filter((j) => j.description !== null);
    const ranked = candidates
      .map((job) => ({ job, result: scoreMatch(profile, skillsForJob(job)) }))
      .filter((m) => m.result.matched.length > 0)
      .sort((a, b) => b.result.score - a.result.score);
    const top = ranked.slice(0, input.limit).map((m) => ({
      job: toCard(m.job),
      score: m.result.score,
      matched_skills: m.result.matched,
      missing_skills: m.result.missing.slice(0, 8),
    }));
    const note = dataNote(loaded.result);
    const text =
      top.length === 0
        ? `No open roles with readable descriptions overlap your skills. ${MATCH_CAVEAT}`
        : [
            `Skills detected in your text: ${profileSkills.join(", ")}`,
            ...top.map((m, i) => `${describeJob(m.job, i + 1)}\n   match ${m.score}/100. Covered: ${m.matched_skills.join(", ")}. Missing: ${m.missing_skills.join(", ") || "none detected"}`),
            `\n${MATCH_CAVEAT}`,
            note,
          ].join("\n");
    return ok(text, {
      skills_detected_in_profile: profileSkills,
      roles_considered: candidates.length,
      matches: top,
      caveat: MATCH_CAVEAT,
      data_note: note,
    });
  },
);

// ---------- hiring_overview ----------

const OverviewOut = z.object({
  companies_with_matches: z.number().int(),
  roles_matched: z.number().int(),
  companies: z.array(
    z.object({
      company: z.string(),
      roles: z.number().int(),
      with_pay: z.number().int().describe("How many of those roles publish a pay range."),
      newest: z.string().nullable().describe("Date of the most recent matching posting, YYYY-MM-DD."),
      top_locations: z.array(z.string()),
      example_title: z.string(),
      example_url: z.string(),
    }),
  ),
  data_note: z.string(),
});

server.tool(
  {
    name: "hiring_overview",
    title: "Which companies are hiring most",
    description:
      "Rank companies by how many open roles match a role type and place, e.g. 'which companies are hiring the most forward deployed engineers in the US'. Gives counts, how many publish pay, newest posting date, main locations and one example link per company. Use search_jobs to list the roles themselves.",
    inputSchema: z.object({
      role_family: FamilySchema.default("fde_or_solutions"),
      location: LocationSchema,
      query: QuerySchema,
      include_management: IncludeManagementSchema,
      posted_within_days: PostedWithinDaysSchema,
      limit: z.number().int().min(1).max(30).default(15).describe("How many companies to return."),
    }),
    outputSchema: OverviewOut,
    annotations: READ_ONLY,
  },
  async (input) => {
    const loaded = await load();
    if ("error" in loaded) return fail(loaded.error);
    const matches = filterJobs(loaded.result.jobs, {
      query: input.query,
      family: input.role_family,
      location: input.location,
      includeManagement: input.include_management,
      postedWithinDays: input.posted_within_days,
    });
    const all = buildHiringOverview(matches);
    const rows = all.slice(0, input.limit);
    const note = dataNote(loaded.result);
    const text =
      rows.length === 0
        ? `No companies have matching open roles. ${note}`
        : `${matches.length} matching roles across ${all.length} companies (top ${rows.length} by number of roles)\n` +
          rows
            .map(
              (r, i) =>
                `${i + 1}. **${r.company}**: ${r.roles} ${r.roles === 1 ? "role" : "roles"}, ${r.with_pay} with published pay, newest ${r.newest ?? "date not in feed"}; ${r.top_locations.join(" / ")}. e.g. ${r.example_title} ${r.example_url}`,
            )
            .join("\n") +
          `\n\n${note}`;
    return ok(text, { companies_with_matches: all.length, roles_matched: matches.length, companies: rows, data_note: note });
  },
);

// ---------- search_company ----------

const SearchCompanyOut = z.object({
  board: z.string(),
  source: z.enum(["ashby", "greenhouse"]),
  tracked: z.boolean().describe("Whether this company is in the tracked list."),
  total_matches: z.number().int(),
  open_roles: z.number().int(),
  jobs: z.array(JobCard),
  data_note: z.string(),
});

server.tool(
  {
    name: "search_company",
    title: "Read any one company's job board",
    description:
      "Read the open roles of one company that is not in the tracked list, from its public Ashby or Greenhouse job board. Needs the board name, which is usually the company name in lowercase with no spaces (for example 'notion' in jobs.ashbyhq.com/notion). Companies on other systems (Lever, Workday and others) cannot be read. The board name is the only identity check, so make sure it is the company the user means.",
    inputSchema: z.object({
      board: z
        .string()
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/, "Board names use letters, digits, dots, dashes and underscores only.")
        .describe("Board name from the company's careers URL, e.g. 'notion'."),
      source: z.enum(["auto", "ashby", "greenhouse"]).default("auto").describe("Which job system. auto tries Ashby, then Greenhouse."),
      role_family: FamilySchema.default("any"),
      location: LocationSchema,
      query: QuerySchema,
      include_management: IncludeManagementSchema,
      limit: z.number().int().min(1).max(25).default(10),
    }),
    outputSchema: SearchCompanyOut,
    annotations: READ_ONLY,
  },
  async (input) => {
    const found = await store.loadAdhoc(input.board, input.source);
    if (!found) {
      return fail(
        `No ${input.source === "auto" ? "Ashby or Greenhouse" : input.source} job board is named "${input.board}". Check the name in the company's careers link. Companies on other systems cannot be read here.`,
      );
    }
    const matches = sortJobs(
      filterJobs(found.jobs, {
        query: input.query,
        family: input.role_family,
        location: input.location,
        includeManagement: input.include_management,
      }),
    );
    const cards = matches.slice(0, input.limit).map(toCard);
    const tracked = COMPANIES.some((c) => c.source === found.company.source && c.slug === found.company.slug);
    const note =
      `Read live from the ${found.company.source === "ashby" ? "Ashby" : "Greenhouse"} job board named "${found.company.slug}"` +
      `${tracked ? "" : " (not in the tracked list; this feed does not state the company name, so confirm it is the right company)"}; confirm details on the original posting before acting.`;
    const text =
      cards.length === 0
        ? `No matching roles on this board (${found.jobs.length} open roles in total). ${note}`
        : `${matches.length} matching roles of ${found.jobs.length} open on "${found.company.slug}" (showing ${cards.length}, newest first)\n${cards.map((c, i) => describeJob(c, i + 1)).join("\n")}\n\n${note}`;
    return ok(text, {
      board: found.company.slug,
      source: found.company.source,
      tracked,
      total_matches: matches.length,
      open_roles: found.jobs.length,
      jobs: cards,
      data_note: note,
    });
  },
);

// ---------- resource: what is tracked ----------

server.resource({ name: "companies", uri: "radar://companies" }, async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "text/plain",
      text: [
        `AI Hiring Radar tracks ${COMPANIES.length} companies via their public career-page feeds (Ashby and Greenhouse).`,
        "",
        ...COMPANIES.map((c) => `${c.name} (${c.source})`),
      ].join("\n"),
    },
  ],
}));

// Export the server; `mcp-use dev`, `build`, and `start` own the HTTP listener.
export default server;
