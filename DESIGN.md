# OSChief Design System

## Product Context
- **What this is:** On-device chief of staff for macOS — meeting intelligence layer that captures, structures, and surfaces your professional knowledge
- **Who it's for:** PMs, founders, and knowledge workers who live in meetings and want a local, private system that remembers everything
- **Space/industry:** AI productivity (peers: Linear, Granola, Raycast, Notion)
- **Project type:** Native Mac desktop app (Electron + React)

## Identity

OSChief is an AI Chief of Staff — a personal command center for professionals. The design should feel like a premium instrument: precise, confident, and trustworthy. Not flashy, not generic — quietly excellent.

**Mood:** Executive briefing room — dense but scannable, urgent but calm. Information-rich surfaces that reward attention without demanding it. Warmer than a developer tool, sharper than a consumer app.

**Aesthetic direction:** Executive Utilitarian — function-first, data-dense, with deliberate warmth. Closest to Linear's "calmer interface" philosophy but warmer and more editorial. The serif accent is the key differentiator — it says "executive instrument," not "SaaS tool."

**Decoration level:** Minimal — typography and spacing do all the work. Color is rare and meaningful.

## Color Tokens (HSL)

### Light Mode
| Token | HSL | Usage |
|-------|-----|-------|
| `--background` | 228 14% 96% | Page background (subtle warm shift from pure cool gray) |
| `--background-warm` | 34 20% 96% | Optional warm paper surface for focus views |
| `--foreground` | 225 22% 10% | Primary text |
| `--card` | 228 12% 99% | Card/surface fill |
| `--primary` | 229 51% 37% | Buttons, links, active states (#2E3F8F — slate navy) |
| `--primary-hover` | 229 51% 30% | Button hover |
| `--secondary` | 228 12% 93% | Secondary backgrounds |
| `--muted` | 226 10% 93% | Disabled, placeholder backgrounds |
| `--muted-foreground` | 225 12% 40% | Secondary text, captions |
| `--border` | 228 11% 89% | Borders, dividers |
| `--destructive` | 0 72% 51% | Errors, delete actions |

### Dark Mode
| Token | HSL | Usage |
|-------|-----|-------|
| `--background` | 225 18% 8% | Page background (warm charcoal, not blue-black) |
| `--background-warm` | 225 14% 9% | Optional warm surface variant |
| `--foreground` | 228 12% 93% | Primary text |
| `--card` | 225 16% 12% | Card/surface fill |
| `--primary` | 229 45% 62% | Buttons, links (lightened for dark bg contrast) |
| `--primary-hover` | 229 45% 55% | Button hover |
| `--secondary` | 225 14% 17% | Secondary backgrounds |
| `--muted` | 225 12% 19% | Disabled, placeholder backgrounds |
| `--muted-foreground` | 228 8% 55% | Secondary text |
| `--border` | 225 12% 19% | Borders, dividers |

### Semantic
| Token | HSL | Usage |
|-------|-----|-------|
| `--recording` | 4 80% 58% | Live recording indicator (pulsing dot) |
| `--ai-active` | 229 55% 55% | AI processing indicator, shimmer accent |
| `--slate-navy` | (maps to `--primary`) | Primary brand color — #2E3F8F |

### Amber Tokens (commitments, suggestions)
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--amber` | 30 55% 64% | 30 50% 58% | Overdue commitment text, suggested status |
| `--amber-bg` | 30 55% 95% | 30 30% 14% | Suggested pill background |
| `--amber-text` | 30 60% 30% | 30 40% 75% | Suggested pill text |

### Green Tokens (active, success)
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--green` | 142 50% 45% | 142 45% 50% | Active status, success states |
| `--green-bg` | 142 50% 94% | 142 30% 12% | Active pill background |
| `--green-text` | 142 50% 20% | 142 40% 70% | Active pill text |

### AI Shimmer Tokens
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--shimmer-from` | 229 30% 94% | 229 20% 14% | Shimmer gradient start |
| `--shimmer-to` | 229 40% 88% | 229 30% 20% | Shimmer gradient end |

## Typography

**Display/Hero:** **Instrument Serif** (regular weight) — premium editorial accent for page titles and greetings. This is the key brand differentiator: no one in the AI productivity space uses a serif accent. It reads "executive instrument," not "SaaS dashboard."

**Body/UI:** **Geist** (variable weight) — excellent for data density, tabular-nums support, and geometric clarity. Font features: `cv02`, `cv03`, `cv04`, `cv11`.

**Code/Technical:** **Geist Mono** — vault URIs, file paths, timestamps, code.

**Font Loading:** Google Fonts CDN for Instrument Serif. Geist self-hosted or via CDN.

### Scale (6 steps)
| Name | Font | Size | Weight | Usage |
|------|------|------|--------|-------|
| Display | Instrument Serif | 28-48px | 400 (regular) | Page titles, greeting, meeting note headers |
| Heading | Geist | 15px | 600 (semibold) | Section headers, card titles |
| Body | Geist | 13.5px | 400 (regular) | Default text, transcript, summaries |
| Caption | Geist | 12px | 500 (medium) | Labels, badges, timestamps, metadata |
| Micro | Geist | 10px | 500 (medium) | Non-essential metadata only |
| Mono | Geist Mono | 12px | 400 (regular) | Vault paths, durations, technical data |

### Rules
- **Instrument Serif is used sparingly** — only page-level titles, the greeting, and meeting note headers. Never for buttons, labels, or body text.
- Body text is intentionally compact (13.5px) — this is a dense, information-rich tool
- Never go below 10px for any text meant to be read
- Section labels use UPPERCASE Caption (e.g., "COMING UP", "PREVIOUS MEETINGS", "WHAT YOU PROMISED")
- Obsidian URIs and file paths use Geist Mono at Caption size

## Spacing

Base unit: **4px**. Use Tailwind spacing scale (gap-1 = 4px, gap-2 = 8px, etc.)

| Context | Spacing |
|---------|---------|
| Between cards | 12px (`gap-3`) |
| Card padding | 16-20px (`p-4` to `p-5`) |
| Section gaps | 24px (`gap-6`) |
| Page padding | 24px (`px-6 py-6`) |
| Inline elements | 4-8px (`gap-1` to `gap-2`) |
| Command Center panel gap | 12px (`gap-3`) |
| Context card padding | 14px (`p-3.5`) |
| Form group spacing | 16px |

## Layout

**Approach:** Grid-disciplined — strict columns, predictable alignment.

**Grid:** Single-column main content with optional right sidebar (280px) for Command Center context panel during recording.

**Max content width:** 960px for standalone pages (Projects, Settings). Full-width for recording view.

**Border radius scale:**
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Buttons, inputs, small elements |
| `--radius-md` | 10px | Cards, panels, modals (up from 8px for Liquid Glass harmony) |
| `--radius-lg` | 14px | Large containers, page sections |
| `--radius-full` | 9999px | Pills, avatars, toggles |

### Liquid Glass Compatibility (macOS Tahoe)
- Sidebar and toolbar should use macOS-native translucency (`-webkit-backdrop-filter: blur()`) where available
- Rounded corners at 10px+ harmonize with Tahoe's design language
- Do not fight the OS — when running on Tahoe, let system chrome be translucent
- Cards maintain their own solid backgrounds for content readability

### Responsive Behavior
| Breakpoint | Behavior |
|------------|----------|
| ≥960px | Full layout with sidebar |
| 768-959px | Sidebar collapses, content fills width |
| <768px | Single-column stack, reduced padding (16px) |
| Floating pill | Always visible at 56px wide, expands on hover |

## Cards

Cards are the primary content container.

```css
/* Light */
background: hsl(var(--card));
border: 1px solid hsl(var(--border));
border-radius: var(--radius-md); /* 10px */
padding: 20px;
box-shadow: var(--card-shadow); /* 0 1px 3px rgba(0,0,0,0.04) */

/* Hover */
box-shadow: var(--card-shadow-hover); /* 0 2px 8px rgba(0,0,0,0.06) */
```

- No heavy shadows — depth comes from subtle elevation
- Cards have a 3px left accent border for categorization (primary for general, green for active, amber for attention-needed)
- Dark mode: shadow increases to rgba(0,0,0,0.2)

## Components

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
- Header: project name (Display — Instrument Serif), status pill, description
- Timeline: meetings ordered by date, each with summary snippet
- Decisions list: text + context + date
- People involved: linked from note_people
- Open commitments related to this project

### Meeting Note Header
- Title in Instrument Serif Display (28px)
- Date, duration, and participants in Caption
- Sections: Summary, Decisions, Action Items, Open Questions
- Section headers use UPPERCASE Caption labels

### Buttons
| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| Primary | `--primary` | white | none |
| Secondary | `--secondary` | `--foreground` | `--border` |
| Ghost | transparent | `--primary` | `--border` |
| Destructive | `--destructive` | white | none |

All buttons: `font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: var(--radius-sm);`

### Form Inputs
```css
.input {
  padding: 8px 12px;
  font-size: 13.5px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.input:focus { border-color: var(--primary); }
```

### Alerts
| Type | Background | Text Color | Icon |
|------|-----------|------------|------|
| Success | `--green-bg` | `--green-text` | ✓ |
| Warning | `--amber-bg` | `--amber-text` | ⚠ |
| Error | hsl(0 72% 95%) / hsl(0 30% 14%) | hsl(0 72% 35%) / hsl(0 60% 70%) | ✗ |
| Info | hsl(229 40% 95%) / hsl(229 20% 14%) | hsl(229 40% 35%) / hsl(229 40% 70%) | ℹ |

## Icons

Lucide React icons throughout. Size scale:
| Context | Size |
|---------|------|
| Inline with text | h-3.5 w-3.5 (14px) |
| Card headers | h-4 w-4 (16px) |
| Section headers | h-4.5 w-4.5 (18px) |
| Empty states | h-8 w-8 to h-10 w-10 |

## Motion

**Approach:** Minimal-functional with one signature element (AI shimmer).

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 50-100ms | ease-out | Button hover, focus rings |
| Short | 150-250ms | ease-out | Toast enter, pill transitions |
| Medium | 250-400ms | ease-in-out | Panel expand/collapse, page transitions |
| Vault checkmark | 300ms | ease-out | SVG stroke-dasharray draw animation |

### AI Shimmer (signature)
Instead of generic spinners, AI processing states use a gentle luminance wave — like light catching paper. This is the chief of staff *reviewing your brief*, not a machine *loading*.

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.ai-shimmer {
  background: linear-gradient(90deg,
    var(--shimmer-from) 0%, var(--shimmer-to) 25%,
    var(--shimmer-from) 50%, var(--shimmer-to) 75%,
    var(--shimmer-from) 100%);
  background-size: 200% 100%;
  animation: shimmer 2.5s ease-in-out infinite;
}
```

Paired with a pulsing dot (6px, `--ai-active` color) and descriptive text: "Reviewing your brief — extracting decisions, commitments, and open questions..."

### Recording Indicator
- 8px dot, `--recording` color
- 2s ease-in-out infinite pulse (opacity 1→0.6, scale 1→1.15)
- No decorative motion. Every animation communicates a state change.

### Skeleton Loading
For content that hasn't loaded yet, use shimmer-based skeleton screens (not spinners):
```css
@keyframes skeleton {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--muted) 25%, var(--secondary) 50%, var(--muted) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
```

## Loading & Empty States

### Loading States
- **Initial app load:** Skeleton screens matching the layout being loaded (not a splash screen)
- **AI processing:** AI shimmer with descriptive text explaining what's happening
- **Transcript processing:** "Reviewing your brief..." shimmer on the transcript panel
- **Data fetch:** Skeleton blocks sized to match expected content

### Empty States
- Use the Lucide icon at h-8 w-8, muted color
- One line of explanation in Caption weight
- Optional primary-color action link
- Never show empty tables/lists — hide the section entirely (progressive disclosure)

### Error States
- Use the alert-error pattern for inline errors
- Form validation: red border + error text below input in 12px
- Network errors: full-width alert banner at top of content area
- Microphone/audio errors: prominent since they block core functionality — use alert-error with clear System Settings link

## Onboarding Flow

### First Launch
1. Welcome screen with Instrument Serif heading: "Your chief of staff is ready."
2. Microphone permission request with clear explanation
3. System audio setup (for meeting capture)
4. Optional: Obsidian vault path configuration
5. Optional: Calendar integration
6. "Start your first meeting" CTA

### Style
- Each step is a centered card (max 480px) on the background
- Progress indicator: dots, not a progress bar
- Primary button advances, ghost button skips optional steps
- No marketing copy in onboarding — get to work fast

## Dark Mode

Full dark mode support via `.dark` class on `<html>`. Strategy:
- Background darkens to warm charcoal (not blue-black) — hue shifts from 222→225
- Text lightens to ~93% (not pure white)
- Borders become subtle (19% lightness vs 89% in light)
- Primary accent shifts to lighter indigo (62% lightness) for contrast
- Amber/green semantic colors desaturate ~5% in dark mode
- Shadows become more prominent (dark needs stronger depth cues)
- AI shimmer gradient adjusts to darker range but maintains the wave effect
- Instrument Serif display text maintains strong contrast in both modes

## Anti-patterns

- No purple/violet gradients
- No AI-slop patterns (centered everything, 3-column icon grids, generic hero copy, decorative blobs)
- No heavy box shadows or glassmorphism (except OS-native Liquid Glass integration)
- No text below 10px in body content
- No `**bold**` abuse — use hierarchy through size and weight, not inline bold
- No red for non-error states — overdue commitments use amber, not destructive red
- No generic loading spinners — use AI shimmer or skeleton screens
- No Instrument Serif for buttons, labels, or body text — it's display-only
- No overused fonts as primary (Inter, Roboto, Poppins, Montserrat) — Geist + Instrument Serif is the stack

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Initial | Geist + Geist Mono, indigo primary, 4px base | Premium instrument aesthetic for information-dense tool |
| 2026-03-23 | Primary shifted from saturated indigo (#3B5EDB) to slate navy (#2E3F8F) | Calmer, more executive. Saturated indigo felt loud and SaaS-generic. |
| 2026-03-23 | Added amber tokens for commitments/suggestions | Warmer than red for non-error urgency. Chief of staff nudges, not alarms. |
| 2026-03-23 | Added green tokens for active/success states | Status pills need color-coded hierarchy without being noisy |
| 2026-03-23 | Command Center: 280px right sidebar | Context panel during recording — dense but scannable, progressive disclosure |
| 2026-03-23 | Vault export: checkmark draw animation | Small delight moment — filing something important should feel satisfying |
| 2026-03-23 | Project status pills over text labels | Visual hierarchy at a glance on the Projects page |
| 2026-03-25 | Aesthetic: Industrial/Utilitarian → Executive Utilitarian | Competitive research showed Linear going colder, Granola going warmer. OSChief needs warmth that matches "chief of staff" identity without becoming casual. |
| 2026-03-25 | Added Instrument Serif for display type | No AI productivity tool uses a serif accent. Immediate brand differentiation — reads "executive" not "SaaS." Researched: Linear (monochrome bold sans), Granola (Quadrant slab serif + Melange), Raycast (dark sans-serif). |
| 2026-03-25 | Warm neutral shift (cool gray → warm gray) | Emotional register shifts from "control panel" to "premium notebook." Hue moved from pure 220 to 225-228. Added warm paper background token (34 hue). |
| 2026-03-25 | AI shimmer replaces loading spinners | Chief of staff "reviews your brief" — not "loading." Custom luminance wave animation at 2.5s cycle. Paired with descriptive text. |
| 2026-03-25 | Border radius: 8px → 10px for cards | macOS Tahoe Liquid Glass uses rounder corners. 10px harmonizes with OS-level design language. |
| 2026-03-25 | Added Liquid Glass compatibility notes | Tahoe is the current macOS. Apps that lean into native translucency feel native; apps that fight it feel foreign. |
| 2026-03-25 | Added loading/empty/error state specs | Complete design system needs state definitions, not just happy-path components. |
| 2026-03-25 | Added onboarding flow design | First impression sets the tone. Instrument Serif greeting + fast permission flow. |
| 2026-03-25 | Added responsive behavior specs | Desktop app still needs breakpoint behavior for window resizing. |
