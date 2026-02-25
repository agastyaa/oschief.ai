// ============================================================================
// Syag AI — Meeting Notes Templates & Types
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

/** Structured data extracted from the markdown post-generation */
export interface ParsedNotes {
  tldr: string
  topics: Array<{
    title: string
    bullets: string[]
  }>
  decisions: string[]
  actionItems: Array<{
    text: string
    assignee: string
    dueDate: string | null
    done: boolean
  }>
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

const SYSTEM_PREAMBLE = `You are Syag AI, a meeting notes assistant. You produce clean, scannable notes from a user's raw notes + a transcript.

CORE PRINCIPLES
1. User notes are primary. They signal what matters. Every point the user wrote must appear. Never drop or contradict them.
2. Transcript fills gaps. Use it for precision — names, dates, numbers, commitments. Don't treat everything said as equally important.
3. Enhance, don't replace. The output should feel like a better version of THEIR notes, not a generic summary.
4. First person. Write from {{USER_NAME}}'s perspective. "I agreed to..." not "The team agreed to..." Use attendee names naturally.
5. Terse. No long sentences. No filler. No "It was discussed that..." — just substance. Active voice.

FORMATTING RULES
- TL;DR is always one line, max 15 words, always first after the title
- Topic headers are bold with **
- Everything under a topic is bullets (- ) and sub-bullets (  - )
- No numbered lists
- No paragraphs or narrative prose
- Direct quotes only when exact wording matters (commitments, strong reactions) — use > blockquote
- Action items format: → **Name** to [task] (by [date] if mentioned)
- Use **Me** when {{USER_NAME}} is the owner

LENGTH
- <15 min meeting → 5-10 bullets total
- 15-30 min → 10-20 bullets
- 30-60 min → 20-40 bullets
- 60+ min → 40-60 bullets
- Match density to user's notes: sparse notes = stay tight, detailed notes = go deeper

NEVER
- Hallucinate content not in the transcript or user notes
- Fabricate action items — only include real commitments
- Add decisions that weren't explicitly made
- Include greetings, small talk, filler, or tangents

EDGE CASES
- Transcript very short or missing → generate only from user notes, don't fabricate
- Both empty → return only the title line and "No notes captured."
- Action items with no owner → mark as **[Unassigned]**
- Action items with no deadline → omit the "(by …)" part, don't write "[No deadline]"

OUTPUT FORMAT (follow exactly)

**[Meeting Title]** — [Date]

**TL;DR:** [One line. Max 15 words. What happened + most important outcome.]

**[Topic 1 — specific name, not "Discussion"]**
- [Key point]
- [Key point]
  - [Supporting detail]
→ **Name** to [action] (by [date])

**[Topic 2]**
- [Key point]
- [Key point]

**Decisions**
- [Decision — only if explicit. Skip section entirely if none.]

**Action Items**
- → **Name** to [task] (by [date])
- → **Name** to [task]

**Open Questions**
- [Anything unresolved — skip section entirely if none.]`

// ---------------------------------------------------------------------------
// Template prompts — each extends the system preamble
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, Omit<MeetingTemplate, 'id'>> = {

  general: {
    name: 'General Meeting',
    icon: '📋',
    description: 'Default template — works for any meeting',
    prompt: `Auto-detect the meeting type from context and apply the most natural structure.
Group by topic, not chronologically. Merge user notes into the relevant topic.
If a clear structure emerges (standup-like, retro-like), lean into it. Otherwise, default to: topics → decisions → action items → open questions.`,
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
- **Feedback** — given or received, be specific
- **Growth & Career** — goals, skills, development
- **Team & Process** — anything about team dynamics

Turn vague commitments into action items: "I'll think about it" → action item.
Include personal/non-work topics if discussed — don't filter them out.`,
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
    prompt: `This is a customer/prospect call. Capture their world.

Topics (use only what was discussed):
- **Customer Context** — who they are, role, company, current solution
- **Pain Points** — their exact frustrations, use their words via > blockquote
- **Product Discussion** — what we showed/explained, what resonated
- **Objections** — what they pushed back on (pricing, timeline, features, competition)
- **Competition** — any competitors mentioned
- **Timeline & Process** — who decides, when, what's next

Every promise we made to them → action item, high urgency.
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

export function buildPrompt(
  template: MeetingTemplate,
  context: MeetingContext,
  userNotes: string,
  transcript: string,
): string {
  const preamble = SYSTEM_PREAMBLE
    .replaceAll('{{USER_NAME}}', context.user.name)

  const vocabLine = context.vocabulary.length > 0
    ? `\nVOCABULARY (spell these correctly): ${context.vocabulary.join(', ')}`
    : ''

  return `${preamble}

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
  const actionItems: ParsedNotes['actionItems'] = []
  const openQuestions: string[] = []

  let currentSection: 'topics' | 'decisions' | 'actions' | 'questions' | null = null
  let currentTopic: { title: string; bullets: string[] } | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // TL;DR line
    if (/^\*?\*?TL;DR:?\*?\*?\s*/i.test(trimmed)) {
      tldr = trimmed.replace(/^\*?\*?TL;DR:?\*?\*?\s*/i, '').trim()
      continue
    }

    // Section headers
    if (/^\*\*Action Items\*\*/i.test(trimmed)) {
      flushTopic()
      currentSection = 'actions'
      continue
    }
    if (/^\*\*Decisions?\*\*/i.test(trimmed)) {
      flushTopic()
      currentSection = 'decisions'
      continue
    }
    if (/^\*\*Open Questions?\*\*/i.test(trimmed)) {
      flushTopic()
      currentSection = 'questions'
      continue
    }

    // Topic header (bold text that isn't a known section)
    if (/^\*\*[^*]+\*\*/.test(trimmed) && !trimmed.startsWith('**TL;DR')) {
      flushTopic()
      const title = trimmed.replace(/^\*\*/, '').replace(/\*\*.*$/, '').trim()

      // Skip the title line (first bold line with date)
      if (/—\s*\d/.test(trimmed) || /\d{4}/.test(trimmed)) continue

      currentSection = 'topics'
      currentTopic = { title, bullets: [] }
      continue
    }

    // Action items (→ or - → prefix)
    if (/^[-→⟶]\s*→?\s*\*\*/.test(trimmed) || /^→\s*\*\*/.test(trimmed)) {
      const parsed = parseActionItem(trimmed)
      if (parsed) {
        actionItems.push(parsed)
        if (currentTopic) currentTopic.bullets.push(trimmed)
      }
      continue
    }

    // Bullets
    if (/^[-•]\s+/.test(trimmed) || /^\s+-\s+/.test(line)) {
      const bullet = trimmed.replace(/^[-•]\s+/, '').trim()
      if (!bullet) continue

      switch (currentSection) {
        case 'decisions':
          decisions.push(bullet)
          break
        case 'actions':
          const item = parseActionItem(trimmed)
          if (item) actionItems.push(item)
          else actionItems.push({ text: bullet, assignee: '[Unassigned]', dueDate: null, done: false })
          break
        case 'questions':
          openQuestions.push(bullet)
          break
        case 'topics':
        default:
          if (currentTopic) currentTopic.bullets.push(trimmed.replace(/^[-•]\s+/, ''))
          break
      }
    }
  }

  flushTopic()

  return { tldr, topics, decisions, actionItems, openQuestions }

  function flushTopic() {
    if (currentTopic && currentTopic.bullets.length > 0) {
      topics.push(currentTopic)
    }
    currentTopic = null
  }
}

function parseActionItem(line: string): ParsedNotes['actionItems'][0] | null {
  const patterns = [
    /→\s*\*\*(?<assignee>[^*]+)\*\*\s*(?:to\s+)?(?<text>.+?)(?:\(by\s+(?<due>[^)]+)\))?\s*$/i,
    /\*\*(?<assignee>[^*]+)\*\*[:\s]+(?<text>.+?)(?:\s*—\s*by\s+(?<due>.+))?\s*$/i,
  ]

  for (const pattern of patterns) {
    const match = line.match(pattern)
    if (match?.groups) {
      return {
        assignee: match.groups.assignee.trim(),
        text: match.groups.text.trim().replace(/\s*\(by\s+[^)]+\)\s*$/, ''),
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
  questionsAndOpenItems: string[]
  followUps: string[]
  keyQuotes: Array<{ speaker: string; text: string }>
}

/** Convert ParsedNotes to MeetingSummary for backward compat with UI consumers. */
export function parsedToMeetingSummary(
  parsed: ParsedNotes,
  title = 'Meeting Notes',
  meetingType = 'general',
): MeetingSummary {
  return {
    title,
    meetingType,
    attendees: [],
    overview: parsed.tldr,
    decisions: parsed.decisions,
    discussionTopics: parsed.topics.map(t => ({
      topic: t.title,
      summary: t.bullets.map(b => (b.startsWith('-') ? b : `- ${b}`)).join('\n') || '-',
      speakers: [],
    })),
    actionItems: parsed.actionItems.map(a => ({
      text: a.text,
      assignee: a.assignee,
      dueDate: a.dueDate ?? undefined,
      priority: 'medium' as const,
      done: a.done,
    })),
    questionsAndOpenItems: parsed.openQuestions,
    followUps: [],
    keyQuotes: [],
  }
}

/** Backward compat: detect meeting type from transcript/notes when calendar context unavailable. */
export function detectMeetingTypeFromContent(transcript: string, personalNotes: string): string {
  return detectMeetingType('', null, 0, transcript, personalNotes)
}
