# Syag Design System

## Product Context
- **What this is:** On-device chief of staff for macOS — meeting intelligence layer that captures, structures, and surfaces your professional knowledge
- **Who it's for:** PMs, founders, and knowledge workers who live in meetings and want a local, private system that remembers everything
- **Space/industry:** AI productivity (peers: Linear, Granola, Raycast, Notion)
- **Project type:** Native Mac desktop app (Electron + React)

## Identity

Syag is an AI Chief of Staff — a personal command center for professionals. The design should feel like a premium instrument: precise, confident, and trustworthy. Not flashy, not generic — quietly excellent.

**Mood:** Mission control during a briefing — dense but scannable, urgent but calm. Information-rich surfaces that reward attention without demanding it.

**Aesthetic direction:** Industrial/Utilitarian — function-first, data-dense, monospace accents, muted palette. Closest to Linear's "calmer interface" philosophy but warmer.

**Decoration level:** Minimal — typography and spacing do all the work. Color is rare and meaningful.

## Color Tokens (HSL)

### Light Mode
| Token | HSL | Usage |
|-------|-----|-------|
| `--background` | 220 16% 95% | Page background |
| `--foreground` | 222 25% 8% | Primary text |
| `--card` | 220 14% 99% | Card/surface fill |
| `--primary` | 229 51% 37% | Buttons, links, active states (#2E3F8F — slate navy) |
| `--primary-hover` | 229 51% 30% | Button hover |
| `--secondary` | 220 14% 92% | Secondary backgrounds |
| `--muted` | 218 12% 92% | Disabled, placeholder backgrounds |
| `--muted-foreground` | 220 15% 35% | Secondary text, captions |
| `--border` | 220 13% 88% | Borders, dividers |
| `--destructive` | 0 72% 51% | Errors, delete actions |

### Dark Mode
| Token | HSL | Usage |
|-------|-----|-------|
| `--background` | 222 20% 7% | Page background (rich black) |
| `--foreground` | 220 14% 92% | Primary text |
| `--card` | 222 18% 11% | Card/surface fill |
| `--primary` | 229 45% 60% | Buttons, links, active states (lightened slate navy for dark bg) |
| `--primary-hover` | 229 45% 53% | Button hover |
| `--secondary` | 222 16% 16% | Secondary backgrounds |
| `--muted` | 222 14% 18% | Disabled, placeholder backgrounds |
| `--muted-foreground` | 220 10% 55% | Secondary text |
| `--border` | 222 14% 18% | Borders, dividers |

### Semantic
| Token | HSL | Usage |
|-------|-----|-------|
| `--recording` | 4 80% 58% | Live recording indicator (pulsing dot) |
| `--ai-active` | 229 55% 55% | AI processing indicator |
| `--slate-navy` | (maps to `--primary`) | Primary brand color — #2E3F8F |

### v2 Tokens — Amber (commitments, suggestions)
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--amber` | 30 55% 64% | 30 50% 58% | Overdue commitment text, suggested status |
| `--amber-bg` | 30 55% 95% | 30 30% 14% | Suggested pill background |
| `--amber-text` | 30 60% 30% | 30 40% 75% | Suggested pill text |

### v2 Tokens — Green (active, success)
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--green` | 142 50% 45% | 142 45% 50% | Active status, success states |
| `--green-bg` | 142 50% 94% | 142 30% 12% | Active pill background |
| `--green-text` | 142 50% 20% | 142 40% 70% | Active pill text |

## Typography

Font: **Geist** (variable weight), **Geist Mono** for code/technical and vault URIs.
Font features: `cv02`, `cv03`, `cv04`, `cv11` (geometric alternates).

### Scale (5 steps)
| Name | Size | Weight | Usage |
|------|------|--------|-------|
| Display | 20px | 600 (semibold) | Page titles, greeting |
| Heading | 15px | 600 (semibold) | Section headers |
| Body | 13.5px | 400 (regular) | Default text |
| Caption | 12px | 500 (medium) | Labels, badges, timestamps, metadata |
| Micro | 10px | 500 (medium) | Non-essential metadata only |

### Rules
- Body text is intentionally compact (13.5px) — this is a dense, information-rich tool
- Never go below 10px for any text meant to be read
- Section labels use UPPERCASE Caption (e.g., "COMING UP", "PREVIOUS MEETINGS", "WHAT YOU PROMISED")
- Obsidian URIs and file paths use Geist Mono at Caption size

## Spacing

Base unit: **4px**. Use Tailwind spacing scale (gap-1 = 4px, gap-2 = 8px, etc.)

| Context | Spacing |
|---------|---------|
| Between cards | 12px (`gap-3`) |
| Card padding | 16px (`p-4`) |
| Section gaps | 24px (`gap-6`) |
| Page padding | 24px (`px-6 py-6`) |
| Inline elements | 4-8px (`gap-1` to `gap-2`) |
| Command Center panel gap | 12px (`gap-3`) |
| Context card padding | 12px (`p-3`) |

## Layout

**Approach:** Grid-disciplined — strict columns, predictable alignment.

**Grid:** Single-column main content with optional right sidebar (280px) for Command Center context panel during recording.

**Max content width:** 960px for standalone pages (Projects, Settings). Full-width for recording view.

**Border radius scale:**
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Buttons, inputs, small elements |
| `--radius-md` | 8px | Cards, panels, modals |
| `--radius-lg` | 12px | Large containers, page sections |
| `--radius-full` | 9999px | Pills, avatars, toggles |

## Cards

Cards are the primary content container.

```css
/* Light */
background: hsl(var(--card));
border: 1px solid hsl(var(--border));
border-radius: var(--radius-md); /* 8px */
padding: 16px;
box-shadow: var(--card-shadow); /* 0 1px 3px rgba(0,0,0,0.04) */

/* Hover */
box-shadow: var(--card-shadow-hover); /* 0 2px 8px rgba(0,0,0,0.06) */
```

- No heavy shadows — depth comes from subtle elevation
- Cards have a 3px left accent border for categorization (like note cards)
- Dark mode: shadow increases to rgba(0,0,0,0.2)

## v2 Components

### Project Status Pills
Muted colored pills — not text labels. Provides visual hierarchy without noise.

```css
.pill { padding: 2px 10px; border-radius: var(--radius-full); font-size: 11px; font-weight: 500; }
.pill-suggested { background: var(--amber-bg); color: var(--amber-text); }
.pill-active { background: var(--green-bg); color: var(--green-text); }
.pill-archived { background: var(--muted); color: var(--muted-fg); }
```

### Command Center Panel
Right sidebar (280px) during active recording. Contains context cards:
- **Previous Meetings** — person name (primary color) + meeting title + date
- **What You Promised** — overdue items use `--amber` color (not red). Red = error. Amber = "hey, don't forget."
- **Project** — active pill + name + meeting/decision counts
- Sections only render when data exists (progressive disclosure)
- Hidden sections = hidden, not empty state
- All-empty fallback: "Recording in progress. Context will appear as your meeting history grows."

### Vault Export Toast
Success feedback after vault write:
- Checkmark icon (green circle, white check) + "Saved to vault" + "Open in Obsidian" link (primary color)
- The checkmark uses a brief draw animation (SVG stroke-dasharray, 300ms ease-out) — the moment should feel satisfying
- Toast auto-dismisses after 5 seconds, or click to dismiss

### Projects Page
- Tab bar: Active / Suggested / Archived (active tab has primary-color bottom border)
- Project rows: name (font-weight: 500) + metadata (caption) + status pill
- Suggested projects section: "Confirm" / "Merge with..." / "Dismiss" actions

### Project Detail Page
- Header: project name (Display), status pill, description
- Timeline: meetings ordered by date, each with summary snippet
- Decisions list: text + context + date
- People involved: linked from note_people
- Open commitments related to this project

## Icons

Lucide React icons throughout. Size scale:
| Context | Size |
|---------|------|
| Inline with text | h-3.5 w-3.5 (14px) |
| Card headers | h-4 w-4 (16px) |
| Section headers | h-4.5 w-4.5 (18px) |
| Empty states | h-8 w-8 to h-10 w-10 |

## Motion

**Approach:** Minimal-functional — only transitions that aid comprehension.

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 50-100ms | ease-out | Button hover, focus rings |
| Short | 150-250ms | ease-out | Toast enter, pill transitions |
| Medium | 250-400ms | ease-in-out | Panel expand/collapse, page transitions |
| Vault checkmark | 300ms | ease-out | SVG stroke-dasharray draw animation |

- Recording dot: 2s ease-in-out infinite pulse (opacity 1→0.6, scale 1→1.15)
- No decorative motion. Every animation communicates a state change.

## Dark Mode

Full dark mode support via `.dark` class on `<html>`. Strategy:
- Background darkens, not inverts
- Text lightens to ~92% (not pure white)
- Borders become subtle (12% lightness vs 88% in light)
- Primary accent shifts to lighter indigo for contrast
- Amber/green semantic colors desaturate 10% in dark mode
- Shadows become more prominent (dark needs stronger depth cues)

## Anti-patterns

- No purple/violet gradients
- No AI-slop patterns (centered everything, 3-column grids, generic hero copy)
- No heavy box shadows or glassmorphism
- No text below 10px in body content
- No `**bold**` abuse — use hierarchy through size and weight, not inline bold
- No red for non-error states — overdue commitments use amber, not destructive red

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Initial | Geist + Geist Mono, indigo primary, 4px base | Premium instrument aesthetic for information-dense tool |
| 2026-03-23 | Primary shifted from saturated indigo (#3B5EDB) to slate navy (#2E3F8F) | Calmer, more executive. Saturated indigo felt loud and SaaS-generic against muted backgrounds. Slate navy is "composed" — better for chief of staff identity. |
| Initial | Compact 13.5px body, 5-step type scale | Dense data, professional audience — optimized for scanning |
| 2026-03-23 | Added amber tokens for commitments/suggestions | Warmer than red for non-error urgency. Chief of staff nudges, not alarms. |
| 2026-03-23 | Added green tokens for active/success states | Status pills need color-coded hierarchy without being noisy |
| 2026-03-23 | Command Center: 280px right sidebar | Context panel during recording — dense but scannable, progressive disclosure |
| 2026-03-23 | Vault export: checkmark draw animation | Small delight moment — filing something important should feel satisfying |
| 2026-03-23 | Project status pills over text labels | Visual hierarchy at a glance on the Projects page |
