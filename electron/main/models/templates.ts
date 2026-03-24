// ============================================================================
// OSChief AI — Meeting Notes Templates & Types
// Architecture: LLM outputs markdown → app parses structured data from it
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw markdown output from the LLM. This is the primary artifact. */
export interface EnhancedNotes {
  /** Full markdown string — the notes as the user sees them */
  markdown: string
  /** Parsed from markdown after generation */
  parsed: ParsedNotes
}

export interface ParsedActionItem {
  text: string
  assignee: string
  dueDate: string | null
  done: boolean
}

/** Structured data extracted from the markdown post-generation */
export interface ParsedNotes {
  tldr: string
  topics: Array<{
    title: string
    bullets: Array<{ text: string; subBullets?: string[] }>
    actionItems?: ParsedActionItem[]
    decisions?: string[]
  }>
  /** Flattened for backward compat */
  decisions: string[]
  actionItems: ParsedActionItem[]
  openQuestions: string[]
}

/** Context fed into every prompt */
export interface MeetingContext {
  title: string
  date: string
  duration: string | null
  attendees: string[]
  calendarDescription: string | null
  user: {
    name: string
    role: string
    org: string
  }
  /** Domain terms sent to Whisper initial_prompt AND injected into LLM prompt */
  vocabulary: string[]
}

export interface MeetingTemplate {
  id: string
  name: string
  icon: string
  description: string
  prompt: string
}

// ---------------------------------------------------------------------------
// System prompt — shared preamble for all templates
// ---------------------------------------------------------------------------

const SYSTEM_PREAMBLE = `You are OSChief AI, a meeting notes assistant. You produce crisp, scannable notes from a user's raw notes + a transcript. Your notes should read like a sharp EA wrote them — every bullet earns its place. Granola-style: very tight, scannable bullets; no filler; someone should get the gist in seconds.

CORE PRINCIPLES
1. User notes are primary. Every point the user wrote must appear. Never drop or contradict them.
2. Transcript fills gaps — names, dates, numbers, commitments, reasoning. Don't treat everything said as equally important.
3. The output should feel like a better version of THEIR notes, not a generic summary.
4. First person. Write from {{USER_NAME}}'s perspective. Use attendee names naturally.
5. Substance only. No filler. No "It was discussed that..." — just what matters and why.

EVERY BULLET MUST PASS THIS TEST
Ask: "If someone reads only this bullet, do they know what happened AND why it matters?" If the bullet just says what was talked about ("Discussed the timeline") it fails. It should say what was decided, learned, or committed to ("Ship date moved to March 28 — QA needs two extra days").

CRISPNESS
- Scannable in 30 seconds. Headers + bullets only. No paragraphs.
- Max 12 words per bullet. One idea per bullet.
- 3-5 topics max. Merge closely related points.
- No repetition across bullets or sections.
- Skip filler: "It was noted that", "The team discussed", "There was a conversation about".
- Every topic must have at least one bullet that captures a conclusion, decision, or takeaway — not just what was raised.

QUALITY MUST BE CONSISTENT START TO FINISH
- Later topics deserve the same depth as the first topic. Do not rush or thin out toward the end.
- If a topic was discussed for 10 minutes, it gets real bullets with substance — not "Also covered X."
- Re-read your last 2 topics before finishing. If they're weaker than your first 2, rewrite them.

FORMATTING
- TL;DR: one line, max 15 words, always first after the title. Must state what happened + the most important outcome.
- Use plain text in bullets and body — no markdown bold (no **) in the content. Only use ** for the required structure lines below (title, TL;DR, topic headers, action item assignees).
- Topic headers: **Topic name** — use specific names, never "Discussion" or "Other Topics" or "Miscellaneous".
- Bullets: (- ) and sub-bullets (  - ). No numbered lists. No paragraphs.
- Quotes: only when exact wording matters (commitments, strong reactions) — use > blockquote.
- Action items: default form is **unassigned** — use → [task] (by [date] if mentioned). Do **not** prefix with **Me**, **You**, or **{{USER_NAME}}**.
- Only use → **Name** to [task] when the transcript or user notes **explicitly name** a **different** person (real name as stated) as the owner. Never infer the note-taker as owner from context alone — they assign themselves in the UI.
- Decisions: → **Decision:** [what was decided]. Include reasoning in a sub-bullet if it was stated.

LENGTH (respect meeting duration)
- <15 min → 5-8 bullets total
- 15-30 min → 8-15 bullets
- 30-60 min → 15-25 bullets
- 60+ min → 25-40 bullets
- Lean tight. Sparse notes = stay tight, detailed notes = slightly deeper but never verbose.

NEVER
- Hallucinate content not in the transcript or user notes
- Fabricate action items — only include real commitments
- Add decisions that weren't explicitly made
- Include greetings, small talk, filler, or tangents
- Write a bullet that only says something "was discussed" without capturing what was said

EDGE CASES
- Transcript very short or missing → generate only from user notes, don't fabricate
- Both empty → return only the title line and "No notes captured."

OUTPUT FORMAT (follow exactly)

**[Meeting Title]** — [Date]
(When Title is "Untitled", generate a short descriptive title (3–6 words) from the main topic.)

**TL;DR:** [One line. What happened + most important outcome.]

**[Topic 1 — specific name]**
- [What was concluded or learned — not just what was raised]
- [Key point with specifics: names, numbers, dates]
  - [Supporting detail]
→ [action] (by [date])
→ **Decision:** [decision text]
  - [Reasoning if stated]

**[Topic 2 — equally specific]**
- [Same quality as Topic 1 — no thinning out]
  - [Detail]
→ [action]
→ **Jane** to [action] (only when Jane is explicitly named as owner in source material)

Place action items and decisions under the topic they belong to. Omit if none apply.`

// ---------------------------------------------------------------------------
// Template prompts — each extends the system preamble
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, Omit<MeetingTemplate, 'id'>> = {

  general: {
    name: 'General Meeting',
    icon: '📋',
    description: 'Default template — works for any meeting',
    prompt: `Auto-detect the meeting type and apply the most natural structure.
Group by topic, not chronologically. Merge user notes into the relevant topic.

WHAT GOOD LOOKS LIKE
- Every bullet captures a conclusion, decision, number, or commitment — not just a topic label.
- Bad: "Discussed the roadmap." Good: "Roadmap locked: auth → billing → API, shipping Q2."
- Bad: "Talked about hiring." Good: "Opening 2 senior eng roles; posting by Friday."
- If someone skipped the meeting, these notes should tell them exactly what they need to know.

DISCIPLINE THROUGH THE END
- The last topic in the meeting gets the same quality as the first. Don't trail off.
- If the meeting ended with important decisions or action items, make sure they're captured with full specificity.
- "Wrapped up with some discussion about X" is never acceptable. State what was said about X.`,
  },

  standup: {
    name: 'Standup / Daily',
    icon: '🏃',
    description: 'Per-person updates, blockers, and plans',
    prompt: `This is a standup. Structure by person, not by topic.

**[Person Name]**
- Done: [what they completed]
- Doing: [what they're working on]
- Blocker: [what's stuck — or "No blockers"]

Every blocker → action item with owner.
TL;DR: one line covering team status (e.g. "Sprint on track, 2 blockers on auth and deploy").
Keep it tight. No narrative. Just status.`,
  },

  'one-on-one': {
    name: '1:1 Meeting',
    icon: '🤝',
    description: 'Check-ins, feedback, goals, and growth',
    prompt: `This is a 1:1. Use topic themes, not speaker-per-section.

Typical topics (use only what was discussed):
- **Check-in** — how they're doing, energy, workload
- **Project Updates** — status of current work
- **Feedback** — given or received, be specific about what and the reaction
- **Growth & Career** — goals, skills, development
- **Team & Process** — anything about team dynamics

SPECIFICITY MATTERS
- Bad: "Talked about career goals." Good: "Wants to move toward tech lead; we'll identify a project to stretch on by next 1:1."
- Bad: "Gave feedback on the PR process." Good: "I said PR reviews are taking 3+ days; she'll propose a review rotation this week."
- Turn vague commitments into action items: "I'll think about it" → action item.
- Include personal/non-work topics if discussed — don't filter them out.
- The last topic discussed is often the most candid. Don't shortchange it.`,
  },

  brainstorm: {
    name: 'Brainstorm',
    icon: '💡',
    description: 'Ideas, evaluation, and next steps',
    prompt: `This is a brainstorming session. One topic per idea or approach.

For each idea:
- One line: what the idea is
- Pro: [advantage raised]
- Con: [concern raised]
- Verdict: **Selected** / **Parked** / **Needs research**

Selected ideas → action items with owner and next step.
TL;DR: what was brainstormed + which idea(s) won.`,
  },

  'customer-call': {
    name: 'Customer Call',
    icon: '📞',
    description: 'Pain points, requirements, and commitments',
    prompt: `This is a customer/prospect call. Capture their world, not ours.

Topics (use only what was discussed):
- **Customer Context** — who they are, role, company, current solution
- **Pain Points** — their exact frustrations, use their words via > blockquote
- **Product Discussion** — what we showed, what resonated, what fell flat
- **Objections** — what they pushed back on (pricing, timeline, features, competition)
- **Competition** — any competitors mentioned, what they liked about them
- **Timeline & Process** — who decides, when, what's next, what could block the deal

CAPTURE THE SIGNAL
- Their exact words matter more than your interpretation. Use > blockquotes for pain and objections.
- "Seemed interested in the dashboard" is useless. "Said 'this would save my team 2 hours a week on reporting'" is gold.
- Objections and timeline are often discussed late in the call — capture them with full detail, not "also discussed pricing."
- Every promise we made → action item, high urgency.
TL;DR: who they are + temperature (hot/warm/cold) + key outcome.`,
  },

  interview: {
    name: 'Interview',
    icon: '🎯',
    description: 'Candidate assessment and recommendation',
    prompt: `This is a hiring interview. Structured assessment.

Topics (use only what was covered):
- **Background** — relevant experience, career arc
- **Technical** — skills demonstrated, depth of knowledge
- **Problem Solving** — how they approached questions
- **Culture & Values** — team fit, communication style
- **Candidate Questions** — what they asked us (reveals priorities)
- **Overall** — 1-2 line assessment with strengths and concerns

Mark strengths and concerns explicitly:
- ✓ Strength: [specific observation]
- ✗ Concern: [specific observation]

Use > blockquotes for 2-3 standout candidate answers.
Action items: next steps (schedule follow-up, send exercise, make decision by X).`,
  },

  retrospective: {
    name: 'Retrospective',
    icon: '🔄',
    description: 'What went well, what to improve, and commitments',
    prompt: `This is a retrospective. Use exactly three topic sections:

**What Went Well**
- [things to keep doing]

**What Didn't Go Well**
- [problems and frustrations]

**Improvements**
- [specific changes to try]

Every improvement → action item with an owner.
TL;DR: one line covering sprint/period health + top improvement.`,
  },
}

// ---------------------------------------------------------------------------
// Exported template list + helpers
// ---------------------------------------------------------------------------

export const MEETING_TEMPLATES: MeetingTemplate[] = Object.entries(TEMPLATES).map(
  ([id, t]) => ({ id, ...t })
)

export function getTemplate(templateId: string): MeetingTemplate {
  return MEETING_TEMPLATES.find(t => t.id === templateId) ?? MEETING_TEMPLATES[0]
}

// ---------------------------------------------------------------------------
// Prompt builder — assembles the full prompt sent to the LLM
// ---------------------------------------------------------------------------

/** Few-shot output example for local models that need extra formatting guidance. */
const FEW_SHOT_EXAMPLE = `
EXAMPLE OUTPUT (follow this format exactly):

**Weekly Product Sync** — Mon, Mar 17, 2026

**TL;DR:** Pushed v2.1 launch to April 4; onboarding redesign approved; hired senior BE.

**Launch Timeline**
- v2.1 pushed two weeks to April 4 — QA found auth edge cases in SSO flow
  - Affects enterprise pilot with Acme Corp; Sarah will notify their team
→ Fix SSO token refresh by March 28
→ **Decision:** Ship without SAML support; add in v2.2

**Onboarding Redesign**
- New 3-step flow approved — removes company-size step, adds role picker
- A/B test showed 22% completion lift in prototype
→ **Maya** to finalize Figma by Friday
→ Ship behind feature flag by April 1
`

export function buildPrompt(
  template: MeetingTemplate,
  context: MeetingContext,
  userNotes: string,
  transcript: string,
  /** Include few-shot example for local/Ollama models that benefit from format guidance. */
  includeFewShot?: boolean,
): string {
  const preamble = SYSTEM_PREAMBLE
    .replaceAll('{{USER_NAME}}', context.user.name)

  const vocabLine = context.vocabulary.length > 0
    ? `\nVOCABULARY (spell these correctly): ${context.vocabulary.join(', ')}`
    : ''

  const fewShotSection = includeFewShot ? FEW_SHOT_EXAMPLE : ''

  return `${preamble}
${fewShotSection}
TEMPLATE-SPECIFIC INSTRUCTIONS
${template.prompt}

---

MEETING CONTEXT
Title: ${context.title}
Date: ${context.date}
${context.duration ? `Duration: ${context.duration}` : ''}
Attendees: ${context.attendees.length > 0 ? context.attendees.join(', ') : 'Unknown'}
${context.calendarDescription ? `Calendar description: ${context.calendarDescription}` : ''}
User: ${context.user.name}, ${context.user.role} at ${context.user.org}
${vocabLine}

USER'S RAW NOTES
${userNotes.trim() || '(none)'}

TRANSCRIPT
${transcript.trim() || '(none)'}

---
Generate the enhanced notes now. Output markdown only. No preamble, no explanation, no code fences.`
}

// ---------------------------------------------------------------------------
// Meeting type detection — calendar first, then transcript fallback
// ---------------------------------------------------------------------------

export function detectMeetingType(
  calendarTitle: string,
  calendarDescription: string | null,
  attendeeCount: number,
  transcript: string,
  personalNotes: string,
): string {
  const title = calendarTitle.toLowerCase()
  const desc = (calendarDescription ?? '').toLowerCase()

  // ── Pass 1: Calendar title (highest confidence) ──────────────────────
  if (/standup|stand-up|daily scrum|daily sync/.test(title)) return 'standup'
  if (/1[:\-]1|one[\s-]on[\s-]one|1on1/.test(title)) return 'one-on-one'
  if (/retro|retrospective|post[\s-]?mortem/.test(title)) return 'retrospective'
  if (/interview|candidate/.test(title)) return 'interview'
  if (/brainstorm|ideation/.test(title)) return 'brainstorm'
  if (/customer|client|prospect|demo|discovery/.test(title)) return 'customer-call'

  // ── Pass 2: Calendar description ─────────────────────────────────────
  if (/retro|retrospective/.test(desc)) return 'retrospective'
  if (/interview|candidate/.test(desc)) return 'interview'
  if (/customer|prospect|demo/.test(desc)) return 'customer-call'

  // ── Pass 3: Attendee count heuristic ─────────────────────────────────
  if (attendeeCount === 2) return 'one-on-one'

  // ── Pass 4: Transcript + notes content (lowest confidence) ───────────
  const text = `${transcript} ${personalNotes}`.toLowerCase()

  const signals: Record<string, number> = {
    standup: 0,
    'one-on-one': 0,
    brainstorm: 0,
    'customer-call': 0,
    interview: 0,
    retrospective: 0,
  }

  const patterns: Record<string, [RegExp, number][]> = {
    standup: [
      [/\b(blocker|blocked|blocking|impediment)\b/gi, 3],
      [/\b(yesterday|today|tomorrow)\b/gi, 1],
      [/\bwhat (did you|are you|will you)\b/gi, 2],
    ],
    'one-on-one': [
      [/\b(career|growth|development|mentoring)\b/gi, 2],
      [/\bhow are you (doing|feeling)\b/gi, 3],
      [/\b(goals|performance|review)\b/gi, 1],
    ],
    brainstorm: [
      [/\bwhat if\b/gi, 2],
      [/\b(how about|we could|what about|another idea)\b/gi, 2],
      [/\b(pros?|cons?|tradeoff|trade-off)\b/gi, 2],
    ],
    'customer-call': [
      [/\b(pain point|feature request|requirement)\b/gi, 3],
      [/\b(pricing|contract|deal|proposal|subscription)\b/gi, 3],
      [/\b(competitor|alternative|compared to)\b/gi, 2],
    ],
    interview: [
      [/\btell me about\b/gi, 3],
      [/\b(resume|cv|hiring|candidate)\b/gi, 3],
      [/\b(salary|compensation|offer)\b/gi, 2],
    ],
    retrospective: [
      [/\bwhat went (well|wrong)\b/gi, 4],
      [/\b(keep doing|stop doing|start doing)\b/gi, 3],
      [/\b(improve|improvement)\b/gi, 1],
    ],
  }

  for (const [type, rules] of Object.entries(patterns)) {
    for (const [regex, weight] of rules) {
      const matches = text.match(regex)
      if (matches) signals[type] += matches.length * weight
    }
  }

  let bestType = 'general'
  let bestScore = 4

  for (const [type, score] of Object.entries(signals)) {
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }

  return bestType
}

// ---------------------------------------------------------------------------
// Markdown parser — extract structured data from LLM output
// ---------------------------------------------------------------------------

export function parseEnhancedNotes(markdown: string): ParsedNotes {
  const lines = markdown.split('\n')

  let tldr = ''
  const topics: ParsedNotes['topics'] = []
  const decisions: string[] = []
  const actionItems: ParsedActionItem[] = []
  const openQuestions: string[] = []

  let currentSection: 'topics' | 'decisions' | 'actions' | 'questions' | null = null
  let currentTopic: {
    title: string
    bullets: Array<{ text: string; subBullets?: string[] }>
    actionItems?: ParsedActionItem[]
    decisions?: string[]
  } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const isSubBullet = /^\s{2,}-/.test(line) || (line.startsWith('  -') && !line.startsWith('   '))

    // TL;DR line
    if (/^\*?\*?TL;DR:?\*?\*?\s*/i.test(trimmed)) {
      tldr = trimmed.replace(/^\*?\*?TL;DR:?\*?\*?\s*/i, '').trim()
      continue
    }

    // Section headers (backward compat for old format)
    if (/^\*\*Action Items\*\*/i.test(trimmed)) {
      flushTopic()
      currentSection = 'actions'
      currentTopic = null
      continue
    }
    if (/^\*\*Decisions?\*\*/i.test(trimmed)) {
      flushTopic()
      currentSection = 'decisions'
      currentTopic = null
      continue
    }
    if (/^\*\*Open Questions?\*\*/i.test(trimmed)) {
      flushTopic()
      currentSection = 'questions'
      currentTopic = null
      continue
    }

    // Topic header (bold text that isn't a known section)
    if (/^\*\*[^*]+\*\*/.test(trimmed) && !trimmed.startsWith('**TL;DR')) {
      flushTopic()
      const title = trimmed.replace(/^\*\*/, '').replace(/\*\*.*$/, '').trim()
      if (/—\s*\d/.test(trimmed) || /\d{4}/.test(trimmed)) continue
      currentSection = 'topics'
      currentTopic = { title, bullets: [], actionItems: [], decisions: [] }
      continue
    }

    // Decision line: → **Decision:** [text]
    const decisionMatch = trimmed.match(/^→\s*\*\*Decision:?\*\*\s*(.+)$/i)
    if (decisionMatch) {
      const text = decisionMatch[1].trim()
      if (currentTopic && text) {
        currentTopic.decisions = currentTopic.decisions || []
        currentTopic.decisions.push(text)
        decisions.push(text)
      }
      continue
    }

    // Action items (→ **Name** to ... or → [task])
    if (/^→\s*\*\*[^*]+\*\*/.test(trimmed)) {
      const parsed = parseActionItem(trimmed)
      if (parsed) {
        actionItems.push(parsed)
        if (currentTopic) {
          currentTopic.actionItems = currentTopic.actionItems || []
          currentTopic.actionItems.push(parsed)
        }
      }
      continue
    }

    // Sub-bullet (2+ space indent)
    if (isSubBullet) {
      const subText = line.replace(/^\s*-\s*/, '').trim()
      if (!subText) continue
      if (currentTopic && currentTopic.bullets.length > 0) {
        const last = currentTopic.bullets[currentTopic.bullets.length - 1]
        last.subBullets = last.subBullets || []
        last.subBullets.push(subText)
      } else if (currentSection === 'decisions') {
        decisions.push(subText)
      } else if (currentSection === 'actions') {
        const item = parseActionItem(trimmed)
        if (item) actionItems.push(item)
      } else if (currentSection === 'questions') {
        openQuestions.push(subText)
      }
      continue
    }

    // Top-level bullets
    if (/^[-•]\s+/.test(trimmed)) {
      const bullet = trimmed.replace(/^[-•]\s+/, '').trim()
      if (!bullet) continue

      switch (currentSection) {
        case 'decisions':
          decisions.push(bullet)
          break
        case 'actions':
          const item = parseActionItem(trimmed)
          if (item) actionItems.push(item)
          break
        case 'questions':
          openQuestions.push(bullet)
          break
        case 'topics':
        default:
          if (currentTopic) currentTopic.bullets.push({ text: bullet })
          break
      }
    }
  }

  flushTopic()

  return { tldr, topics, decisions, actionItems, openQuestions }

  function flushTopic() {
    if (currentTopic && (currentTopic.bullets.length > 0 || (currentTopic.actionItems?.length ?? 0) > 0 || (currentTopic.decisions?.length ?? 0) > 0)) {
      topics.push({
        ...currentTopic,
        bullets: currentTopic.bullets,
        actionItems: currentTopic.actionItems?.length ? currentTopic.actionItems : undefined,
        decisions: currentTopic.decisions?.length ? currentTopic.decisions : undefined,
      })
    }
    currentTopic = null
  }
}

function parseActionItem(line: string): ParsedActionItem | null {
  const patterns: Array<{ re: RegExp; hasAssignee: boolean }> = [
    { re: /→\s*\*\*(?<assignee>[^*]+)\*\*\s*(?:to\s+)?(?<text>.+?)(?:\(by\s+(?<due>[^)]+)\))?\s*$/i, hasAssignee: true },
    { re: /\*\*(?<assignee>[^*]+)\*\*[:\s]+(?<text>.+?)(?:\s*—\s*by\s+(?<due>.+))?\s*$/i, hasAssignee: true },
    // Plain action without assignee: "→ task" or "- task" or "- task (by date)"
    { re: /^[-→•]\s+(?<text>.+?)(?:\s*\(by\s+(?<due>[^)]+)\))?\s*$/i, hasAssignee: false },
  ]

  for (const { re, hasAssignee } of patterns) {
    const match = line.match(re)
    if (match?.groups?.text) {
      const text = match.groups.text.trim().replace(/\s*\(by\s+[^)]+\)\s*$/, '').trim()
      if (!text) continue
      return {
        assignee: hasAssignee ? (match.groups.assignee?.trim() ?? '') : '',
        text,
        dueDate: match.groups.due?.trim() ?? null,
        done: false,
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Slash command recipes (Ask Anything suggestions)
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string
  command: string
  label: string
  icon: string
  prompt: string
  context: 'live' | 'post' | 'both'
}

export const RECIPES: Recipe[] = [
  {
    id: 'catch-me-up',
    command: '/catch-me-up',
    label: 'Catch me up',
    icon: '⏪',
    context: 'live',
    prompt: `Summarize the last 5 minutes of discussion in 3-4 bullets.
Only: decisions, action items, topic shifts. No preamble. Under 50 words.`,
  },
  {
    id: 'sound-smart',
    command: '/sound-smart',
    label: 'Sound smart',
    icon: '🧠',
    context: 'live',
    prompt: `Based on the current discussion, suggest 1-2 specific questions or points I could raise right now. Make them relevant to what's actually being said. No generic questions.`,
  },
  {
    id: 'actions-so-far',
    command: '/actions-so-far',
    label: 'Action items so far',
    icon: '✅',
    context: 'live',
    prompt: `List every action item committed to so far.
Format: → **Name** to [task]
Only real commitments. Skip vague intentions like "we should probably..."`,
  },
  {
    id: 'summarize-topic',
    command: '/summarize-this',
    label: 'Summarize current topic',
    icon: '📌',
    context: 'live',
    prompt: `What's been said about the current topic in 3-5 bullets. Include any decisions or disagreements.`,
  },
  {
    id: 'follow-up-email',
    command: '/follow-up-email',
    label: 'Draft follow-up email',
    icon: '✉️',
    context: 'post',
    prompt: `Draft a follow-up email to attendees:
- One line thanks (not effusive)
- 2-3 key decisions or takeaways as bullets
- Action items with owners
- Next meeting if scheduled
Professional, direct. Under 150 words. No fluff.`,
  },
  {
    id: 'my-actions',
    command: '/my-actions',
    label: 'My action items',
    icon: '🎯',
    context: 'post',
    prompt: `List only things I ({{USER_NAME}}) need to do from this meeting. Include enough context so I remember what each is about in 3 days. Ignore everyone else's tasks.`,
  },
  {
    id: 'slack-update',
    command: '/slack-update',
    label: 'Slack update',
    icon: '💬',
    context: 'post',
    prompt: `Write a Slack message for people who weren't in this meeting. 3-5 bullets. Casual but informative. No emoji. No fluff.`,
  },
  {
    id: 'decisions-only',
    command: '/decisions',
    label: 'Decisions only',
    icon: '⚖️',
    context: 'post',
    prompt: `List only the decisions made. For each: what was decided, who decided, and any caveats or conditions.`,
  },
  {
    id: 'open-questions',
    command: '/open-questions',
    label: 'Open questions',
    icon: '❓',
    context: 'post',
    prompt: `What's still unresolved? List questions or topics that need follow-up but weren't closed in this meeting.`,
  },
  {
    id: 'draft-ticket',
    command: '/draft-ticket',
    label: 'Draft a ticket',
    icon: '🎫',
    context: 'post',
    prompt: `Turn the most discussed feature/bug/task into a formatted ticket:
**Title**: [concise title]
**Description**: 2-3 sentences of context
**Acceptance Criteria**:
- [bullet]
- [bullet]
**Priority**: [based on meeting urgency signals]`,
  },
  {
    id: 'prep-next',
    command: '/prep-next',
    label: 'Prep next meeting',
    icon: '📅',
    context: 'post',
    prompt: `Based on open questions, parked topics, and action items, draft a suggested agenda for the next meeting with these attendees. Keep it to 3-5 items.`,
  },
]

export function getRecipes(context: 'live' | 'post'): Recipe[] {
  return RECIPES.filter(r => r.context === context || r.context === 'both')
}

export function getRecipeByCommand(command: string): Recipe | undefined {
  const normalized = command.startsWith('/') ? command : `/${command}`
  return RECIPES.find(r => r.command === normalized)
}

// ---------------------------------------------------------------------------
// Backward compatibility — adapt ParsedNotes to legacy MeetingSummary shape
// ---------------------------------------------------------------------------

/** Strip auto-assignees so the UI shows Unassigned until the user picks "Assign to me" or types a name. */
export function normalizeActionAssignee(assignee: string, userDisplayName?: string): string {
  const t = assignee.trim()
  if (!t) return ''
  const lower = t.toLowerCase()
  if (lower === 'me' || lower === 'you' || lower === 'i') return ''
  const uname = userDisplayName?.trim()
  if (uname && lower === uname.toLowerCase()) return ''
  return assignee
}

/** Legacy shape used by EditableSummary, ActionItemsThisWeek, etc. */
export interface MeetingSummary {
  title: string
  meetingType: string
  attendees: string[]
  overview: string
  decisions: string[]
  discussionTopics: Array<{ topic: string; summary: string; speakers: string[] }>
  actionItems: Array<{
    text: string
    assignee: string
    dueDate?: string
    priority: 'high' | 'medium' | 'low'
    done: boolean
  }>
  /** Alias for actionItems — ActionItemsThisWeek and clipboard expect nextSteps */
  nextSteps: Array<{ text: string; assignee: string; done: boolean; dueDate?: string }>
  /** Derived from topic bullets for clipboard/display */
  keyPoints: string[]
  questionsAndOpenItems: string[]
  followUps: string[]
  keyQuotes: Array<{ speaker: string; text: string }>
}

/** Convert ParsedNotes to MeetingSummary for backward compat with UI consumers. */
export function parsedToMeetingSummary(
  parsed: ParsedNotes,
  title = 'Meeting Notes',
  meetingType = 'general',
  /** Used to clear assignees that mean the note-taker (Me/You/user name). */
  userDisplayName?: string,
): MeetingSummary {
  const norm = (a: string) => normalizeActionAssignee(a, userDisplayName)
  const actionItems = parsed.actionItems.map(a => ({
    text: a.text,
    assignee: norm(a.assignee),
    dueDate: a.dueDate ?? undefined,
    priority: 'medium' as const,
    done: a.done,
  }))
  const nextSteps = parsed.actionItems.map(a => ({
      text: a.text,
      assignee: norm(a.assignee),
      done: a.done,
      dueDate: a.dueDate ?? undefined,
    }))
  const keyPoints = parsed.topics.flatMap(t =>
    t.bullets.slice(0, 2).map(b => (typeof b === 'string' ? b : b.text)).filter(Boolean)
  )

  return {
    title,
    meetingType,
    attendees: [],
    overview: parsed.tldr,
    decisions: parsed.decisions,
    discussionTopics: parsed.topics.map(t => ({
      topic: t.title,
      summary: t.bullets.map(b => {
        const bt = typeof b === 'string' ? b : b.text
        const subs = typeof b === 'string' ? undefined : b.subBullets
        if (subs?.length) {
          return `- ${bt}\n${subs.map(s => `  - ${s}`).join('\n')}`
        }
        return bt.startsWith('-') ? bt : `- ${bt}`
      }).join('\n') || '-',
      speakers: [],
    })),
    actionItems,
    nextSteps,
    keyPoints,
    questionsAndOpenItems: parsed.openQuestions,
    followUps: [],
    keyQuotes: [],
  }
}

/** Backward compat: detect meeting type from transcript/notes when calendar context unavailable. */
export function detectMeetingTypeFromContent(transcript: string, personalNotes: string): string {
  return detectMeetingType('', null, 0, transcript, personalNotes)
}
