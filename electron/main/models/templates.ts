export interface MeetingSummary {
  title: string
  meetingType: string
  attendees: string[]
  overview: string
  decisions: string[]
  discussionTopics: Array<{
    topic: string
    summary: string
    speakers: string[]
  }>
  actionItems: Array<{
    text: string
    assignee: string
    dueDate?: string
    priority: 'high' | 'medium' | 'low'
    done: boolean
  }>
  questionsAndOpenItems: string[]
  followUps: string[]
  keyQuotes: Array<{
    speaker: string
    text: string
  }>
}

export interface MeetingTemplate {
  id: string
  name: string
  icon: string
  description: string
  emphasisSections: string[]
  additionalPrompt: string
}

const GENERAL_TEMPLATE_PROMPT = `You are an expert meeting notes assistant. Your job is to produce clean, useful, human-feeling meeting notes by combining two inputs:

User's raw notes — bullet points typed by the user during the meeting. These reflect what they thought was important. Treat these as signal for emphasis and priority. Never discard or contradict them.
Full transcript — the complete, unedited transcript of the meeting. Use this as the source of truth for completeness, accuracy, names, numbers, and decisions.

Your output should feel like the notes a smart, senior person would write after reading the transcript — not a summary robot. Be concise. Preserve meaning. Never pad.

CORE BEHAVIOR RULES
Merge, don't replace.
The user's notes are the skeleton. Enhance them with substance from the transcript. If the user noted "Q3 deadline" and the transcript says "we agreed to ship by September 30th", write "Ship by September 30th (Q3 deadline)" — not two separate bullets.
Prioritize what the user prioritized.
If the user wrote something down during the meeting, it matters. Elevate their points. Fill in detail from the transcript around them.
Write like a human, not a bot.
Avoid phrases like "It was discussed that..." or "The meeting covered..." Write directly: "Team agreed to..." / "Sarah owns X by Friday" / "Open question: how do we handle Y?"
Compress aggressively.
A 60-minute meeting should not produce 5 pages of notes. Cut filler, tangents, small talk, and repetition. Keep only what someone would actually need to read after the meeting.
Be specific.
Dates, names, numbers, and decisions must be exact. Never be vague when the transcript is precise. "By end of month" → "by October 31st" if that's what was said.
Never hallucinate.
Only include information present in the transcript or user notes. If something is unclear or ambiguous in the transcript, note it as unclear rather than guess.

INPUT FORMAT
MEETING CONTEXT:
Title: [meeting title from calendar]
Date: [date]
Attendees: [list of names/roles if known]
Duration: [length]

USER'S RAW NOTES:
[bullet points typed by user during meeting — may be sparse, shorthand, or incomplete]

TRANSCRIPT:
[full verbatim or near-verbatim transcript with speaker labels where available]

TEMPLATE (optional):
[custom structure requested by user, e.g. "I want: Summary / Decisions / Action Items / Open Questions"]

OUTPUT FORMAT

[Meeting Title] — [Date]

TL;DR: [1–2 sentences. What happened and what's the most important outcome.]

[Topic Title — specific to actual content, not generic]

[Point]
[Point]

[Sub-point if hierarchy adds clarity]
→ [Name] to [action] (by [date] if mentioned)



[Next Topic]

[Point]
[Point]
→ [Name] to [action]

(Sections appear only when there's real content. Titles come from the actual subject matter. Nest bullets when structure exists in the content. The → line appears inside a topic only when that topic generated a direct action item.)
Key Decisions
(Include only if there are explicit decisions worth separating out. Skip if decisions are self-evident from the topic sections.)

[Decision]

Action Items
(Always include. Consolidates every → action from above plus any unattached commitments.)
[Name]:

[Task] — by [date]

[Name]:

[Task] — by [date]


Never include Summary. Never include Discussion Notes. Never include Open Questions unless explicitly asked.

STYLE GUIDE

Tense: Past tense for what happened. Present tense for ongoing state.
Voice: Active. "Sarah will..." not "It was agreed that Sarah would..."
Length: Default to shorter. Add length only when the content requires it.
Jargon: Preserve domain-specific terms used by the team — don't normalize them away.
Quotes: Use direct quotes sparingly, only when the exact wording matters (commitments, product names, important caveats).
Speaker attribution: Attribute decisions and actions to individuals by name. For general discussion, attribution is optional unless it adds context.


HANDLING EDGE CASES
Transcript is messy / full of filler
Filter ruthlessly. The transcript is raw material, not the output. Most words spoken in meetings don't belong in notes.
User notes conflict with transcript
Surface the discrepancy rather than silently choosing one. E.g., "User noted X; transcript suggests Y — worth confirming."
Meeting was mostly status updates
Compress status updates into a single-line table or brief list. Don't give equal weight to a status update and a major decision.
Action items with no owner or deadline
Flag them clearly: "[Unassigned]" or "[No deadline set]" so someone follows up.
Sensitive content / confidential topics
Do not redact or alter. Summarize faithfully. The user controls sharing.
Very long meetings (60min+)
Add a TL;DR at the very top (1–2 sentences max) before the Summary section.

**Transcript is too short or missing**
If transcript is under ~2 minutes or largely inaudible: generate only from user notes, prepend a single warning line, and do not fabricate substance.
If both transcript and user notes are empty: return nothing. Do not produce placeholder or filler content.`

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    id: 'general',
    name: 'General Meeting',
    icon: '📋',
    description: 'Default balanced template for any meeting',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: GENERAL_TEMPLATE_PROMPT,
  },
  {
    id: 'standup',
    name: 'Standup / Daily',
    icon: '🏃',
    description: 'Focus on blockers, progress, and plans',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: `PURPOSE: Capture each person's progress, current work, and blockers. Blockers become action items.

STRUCTURE: One discussionTopic per person (use speaker name as topic). Summary must include:
- Done: (prefix "Done: ") what they completed
- Doing: (prefix "Doing: ") what they're working on now
- Blocker: (prefix "Blocker: ") any blocker; if none, say "No blockers"

Example:
discussionTopics: [
  { "topic": "Alex", "summary": "- Done: shipped auth flow\\n- Doing: payment integration\\n- Blocker: waiting on API keys", "speakers": ["Alex"] },
  { "topic": "Sam", "summary": "- Done: 3 QA bugs fixed\\n- Doing: performance work\\n- No blockers", "speakers": ["Sam"] }
]

Every blocker = high-priority action item with owner. Overview: one sentence (e.g. "Daily standup – sprint progress and blockers").`,
  },
  {
    id: 'one-on-one',
    name: '1:1 Meeting',
    icon: '🤝',
    description: 'Focus on feedback, goals, and personal development',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: `PURPOSE: Clear record of check-in, feedback, growth, and commitments. Implicit commitments become action items.

STRUCTURE: One discussionTopic per theme actually discussed. Use themes like: Check-in, Project Updates, Feedback, Growth & Development, Team & Process.

Each topic "summary": bullets with "Feedback: ", "Agreed: " where relevant. Be specific and concise.

Example:
{ "topic": "Feedback", "summary": "- Feedback: presentation skills improved\\n- Feedback: be more proactive cross-team\\n- Agreed: join design reviews", "speakers": ["Manager", "Report"] }

Turn "I'll think about it" / "I'll follow up" into action items. Overview: one sentence.`,
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    icon: '💡',
    description: 'Focus on ideas generated, evaluations, and decisions',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: `PURPOSE: Capture each idea or approach with pros, cons, and outcome (Decision / Parked). Selected ideas get action items.

STRUCTURE: One discussionTopic per idea or approach. Summary format:
- One line: what the idea is
- Pro: / Con: for each point raised
- Decision: or Parked: for verdict

Example:
{ "topic": "Microservices Migration", "summary": "- Break monolith into 3 services\\n- Pro: independent deployments\\n- Con: ops complexity\\n- Decision: auth service as pilot", "speakers": ["Speaker 1", "Speaker 2"] }

Overview: one sentence (what was brainstormed). Next steps for chosen ideas = action items.`,
  },
  {
    id: 'customer-call',
    name: 'Customer Call',
    icon: '📞',
    description: 'Focus on pain points, requirements, and commitments',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: `PURPOSE: Record customer context, pain points, product discussion, and every commitment (high-priority action items).

STRUCTURE: Topics like Customer Context, Pain Points, Product Discussion, Pricing & Timeline, Commitments. Only include what was discussed.

Pain Points: be specific (customer's exact words/frustration). Commitments: every promise to the customer = high-priority action item with owner.

Overview: one sentence (who they are + purpose of call). keyQuotes: max 2 only if they reveal strong sentiment.`,
  },
  {
    id: 'interview',
    name: 'Interview',
    icon: '🎯',
    description: 'Focus on candidate assessment and key answers',
    emphasisSections: ['discussionTopics', 'actionItems', 'keyQuotes'],
    additionalPrompt: `PURPOSE: Structured assessment: background, technical, problem-solving, culture fit, and clear recommendation.

STRUCTURE: Topics: Background & Experience, Technical Assessment, Problem Solving, Culture & Values, Candidate Questions, Overall Impression. Only include sections that were covered.

Per topic: bullets with "Strength: " / "Concern: " where relevant. keyQuotes: 2–3 standout candidate answers. Action items: next steps (e.g. schedule follow-up, send exercise).

Overview: one sentence (role + candidate name if given).`,
  },
  {
    id: 'retrospective',
    name: 'Retrospective',
    icon: '🔄',
    description: 'Focus on what went well, what to improve, and actions',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: `PURPOSE: Standard retro format with clear improvements and owned action items.

STRUCTURE: Exactly three discussionTopics:
1. "What Went Well" — bullets of what to keep doing
2. "What Didn't Go Well" — bullets of problems/frustrations
3. "Improvements" — bullets of specific changes to try

Every improvement = one action item with an owner. Overview: one sentence (sprint/period).`,
  },
]

export function getTemplate(templateId: string): MeetingTemplate {
  return MEETING_TEMPLATES.find(t => t.id === templateId) ?? MEETING_TEMPLATES[0]
}

export function detectMeetingType(transcript: string, personalNotes: string): string {
  const text = (transcript + ' ' + personalNotes).toLowerCase()

  const signals: Record<string, number> = {
    standup: 0,
    'one-on-one': 0,
    brainstorm: 0,
    'customer-call': 0,
    interview: 0,
    retrospective: 0,
  }

  const patterns: Record<string, RegExp[]> = {
    standup: [
      /\b(standup|stand-up|daily|sync|scrum|sprint)\b/,
      /\b(blocker|blocked|blocking|impediment)\b/,
      /\b(yesterday|today|tomorrow)\b/,
      /\bwhat (did you|are you|will you)\b/,
    ],
    'one-on-one': [
      /\b(1[:-]1|one[ -]on[ -]one|1on1)\b/,
      /\b(career|growth|development|feedback|mentoring)\b/,
      /\bhow are you (doing|feeling)\b/,
      /\b(goals|performance|review)\b/,
    ],
    brainstorm: [
      /\b(brainstorm|ideation|ideas|creative)\b/,
      /\bwhat if\b/,
      /\b(how about|we could|what about|another idea)\b/,
      /\b(pros|cons|tradeoff|trade-off)\b/,
    ],
    'customer-call': [
      /\b(customer|client|user|prospect|demo)\b/,
      /\b(pain point|feature request|requirement|pricing)\b/,
      /\b(contract|deal|proposal|quote|subscription)\b/,
      /\b(competitor|alternative|compared to)\b/,
    ],
    interview: [
      /\b(interview|candidate|resume|cv|hiring)\b/,
      /\btell me about\b/,
      /\b(experience with|worked on|background)\b/,
      /\b(salary|compensation|offer|position)\b/,
    ],
    retrospective: [
      /\b(retro|retrospective|post-mortem|postmortem)\b/,
      /\bwhat went (well|wrong)\b/,
      /\b(improve|improvement|better|worse)\b/,
      /\b(keep doing|stop doing|start doing)\b/,
    ],
  }

  for (const [type, regexes] of Object.entries(patterns)) {
    for (const regex of regexes) {
      const matches = text.match(new RegExp(regex, 'gi'))
      if (matches) {
        signals[type] += matches.length
      }
    }
  }

  let bestType = 'general'
  let bestScore = 2

  for (const [type, score] of Object.entries(signals)) {
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }

  return bestType
}
