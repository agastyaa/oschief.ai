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

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    id: 'general',
    name: 'General Meeting',
    icon: '📋',
    description: 'Default balanced template for any meeting',
    emphasisSections: ['discussionTopics', 'actionItems'],
    additionalPrompt: `PURPOSE: Produce clear, scannable notes: key discussion points, decisions, and action items. Be concise; no filler.

STRUCTURE: One discussionTopic per actual subject discussed. Use SPECIFIC topic names (e.g. "Q3 Launch Timeline", not "Updates").

For each topic "summary": 2–5 bullet points. Each bullet = one line, one idea, max 15 words. Include:
- Key points raised
- Decisions (prefix with "Decision: ")
- Attribution only when it matters

Example:
discussionTopics: [
  { "topic": "Q3 Launch Timeline", "summary": "- Sept 15 launch agreed\\n- Marketing assets need 2 more weeks\\n- Decision: delay beta 1 week to align", "speakers": ["Speaker 1", "Speaker 2"] },
  { "topic": "Hiring Update", "summary": "- 3 candidates in pipeline\\n- Interviews next week", "speakers": ["Speaker 1"] }
]

Overview: exactly one sentence (what the meeting was about). Action items: "[Task] — [Person]", one per line.
Do NOT use generic topic names ("Discussion", "Miscellaneous"). Omit keyQuotes and followUps unless essential.`,
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
