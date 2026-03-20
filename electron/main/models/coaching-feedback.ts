/**
 * Role-Aware Coaching Feedback
 *
 * After computing numeric coaching metrics, calls the LLM for
 * 2-3 role-specific, actionable coaching observations using the
 * coaching KB's thought leader content.
 */

import { routeLLM } from '../cloud/router'
import { getRoleKB, ROLES } from './coaching-kb'
import { resolveSelectedAIModel } from './model-resolver'

export interface RoleCoachingResult {
  roleInsights: string[]
  roleId: string
}

const SYSTEM_PROMPT = `You are a world-class executive communication coach. You analyze meeting metrics and give specific, actionable feedback rooted in established frameworks.

Rules:
- Return ONLY a JSON array of 2-3 strings — each is one coaching observation.
- Each insight should be 1-2 sentences, specific and actionable.
- Reference the thought leader or framework when it adds credibility.
- Be direct — no preamble, no "Great job overall", no generic advice.
- If metrics are strong across the board, give nuanced improvement tips, not praise.
- No markdown, no explanation, just the JSON array of strings.`

export async function generateRoleCoachingInsights(
  metrics: any,
  roleId: string,
  model?: string
): Promise<RoleCoachingResult> {
  const aiModel = resolveSelectedAIModel(model)
  if (!aiModel) return { roleInsights: [], roleId }

  const kb = getRoleKB(roleId)
  const role = ROLES.find(r => r.id === roleId)
  const roleLabel = role?.label ?? roleId

  const kbContext = kb
    ? `Role: ${roleLabel}\nMetrics focus: ${kb.metricsFocus}\nMeeting coaching: ${kb.meetingCoaching}`
    : `Role: ${roleLabel}`

  const metricsStr = JSON.stringify({
    talkToListenRatio: metrics.talkToListenRatio,
    wordsPerMinute: metrics.wordsPerMinute,
    fillerWordsPerMinute: metrics.fillerWordsPerMinute,
    totalFillerCount: metrics.totalFillerCount,
    interruptionCount: metrics.interruptionCount,
    interruptedByOthersCount: metrics.interruptedByOthersCount,
    pacingScore: metrics.pacingScore,
    concisenessScore: metrics.concisenessScore,
    listeningScore: metrics.listeningScore,
    overallScore: metrics.overallScore,
    yourSpeakingTimeSec: metrics.yourSpeakingTimeSec,
    othersSpeakingTimeSec: metrics.othersSpeakingTimeSec,
    silenceTimeSec: metrics.silenceTimeSec,
  })

  const userMessage = `${kbContext}

Meeting metrics:
${metricsStr}

Based on this ${roleLabel}'s meeting metrics and the role-specific coaching focus above, provide 2-3 specific coaching observations. Return a JSON array of strings.`

  try {
    const response = await routeLLM(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      aiModel
    )

    const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
    if (!Array.isArray(parsed)) return { roleInsights: [], roleId }

    return {
      roleInsights: parsed.filter((s: any) => typeof s === 'string').slice(0, 3),
      roleId,
    }
  } catch (err) {
    console.error('[coaching-feedback] LLM call failed:', err)
    return { roleInsights: [], roleId }
  }
}
