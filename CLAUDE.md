# OSChief

On-device chief of staff for macOS — meetings, memory, and action. Electron + React with AI-powered transcription, summarization, coaching, and a people/project/decision graph.

## gstack

This project includes [gstack](https://github.com/garrytan/gstack) skills for planning, review, QA, and shipping workflows.

**For all web browsing, use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.**

### Available skills

- `/plan-ceo-review` — CEO-level planning review
- `/plan-eng-review` — Engineering planning review
- `/review` — Code review
- `/ship` — Ship/release workflow
- `/browse` — Web browsing (use this for ALL web browsing)
- `/qa` — QA testing
- `/setup-browser-cookies` — Set up browser cookies for authenticated browsing
- `/retro` — Retrospective

### Troubleshooting

If gstack skills aren't working, rebuild the binary and re-register skills:

```sh
cd .claude/skills/gstack && ./setup
```

Requires [Bun](https://bun.sh) v1.0+.

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
