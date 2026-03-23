# Syag Design System

## Identity

Syag is an AI Chief of Staff — a personal command center for professionals. The design should feel like a premium instrument: precise, confident, and trustworthy. Not flashy, not generic — quietly excellent.

## Color Tokens (HSL)

### Light Mode
| Token | HSL | Usage |
|-------|-----|-------|
| `--background` | 220 16% 95% | Page background |
| `--foreground` | 222 25% 8% | Primary text |
| `--card` | 220 14% 99% | Card/surface fill |
| `--primary` | 230 70% 52% | Buttons, links, active states |
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
| `--primary` | 230 62% 65% | Buttons, links, active states |
| `--muted-foreground` | 220 10% 55% | Secondary text |

### Semantic
| Token | Usage |
|-------|-------|
| `--recording` | 4 80% 58% — Live recording indicator |
| `--ai-active` | 230 80% 60% — AI processing indicator |
| `--indigo` | Primary brand color (maps to `--primary`) |

## Typography

Font: **Geist** (variable weight), **Geist Mono** for code/technical.
Font features: `cv02`, `cv03`, `cv04`, `cv11` (geometric alternates).

### Scale (5 steps)
| Name | Size | Weight | Usage |
|------|------|--------|-------|
| Display | 20px | 600 (semibold) | Page titles, greeting |
| Heading | 15px | 600 (semibold) | Section headers |
| Body | 13.5px | 400 (regular) | Default text |
| Caption | 12px | 500 (medium) | Labels, badges, timestamps |
| Micro | 10px | 500 (medium) | Non-essential metadata only |

### Rules
- Body text is intentionally compact (13.5px) — this is a dense, information-rich tool
- Never go below 10px for any text meant to be read
- Section labels use UPPERCASE Caption (e.g., "COMING UP", "RECENT MEETINGS")

## Spacing

Base unit: **4px**. Use Tailwind spacing scale (gap-1 = 4px, gap-2 = 8px, etc.)

| Context | Spacing |
|---------|---------|
| Between cards | 12px (`gap-3`) |
| Card padding | 16px (`p-4`) |
| Section gaps | 24px (`gap-6`) |
| Page padding | 24px (`px-6 py-6`) |
| Inline elements | 4-8px (`gap-1` to `gap-2`) |

## Cards

Cards are the primary content container on the homepage.

```css
/* Light */
background: hsl(var(--card));
border: 1px solid hsl(var(--border));
border-radius: 0.5rem; /* 8px */
padding: 16px;
box-shadow: var(--card-shadow); /* 0 1px 3px rgba(0,0,0,0.04) */

/* Hover */
box-shadow: var(--card-shadow-hover); /* 0 2px 8px rgba(0,0,0,0.06) */
```

- No heavy shadows — depth comes from subtle elevation
- Cards have a 3px left accent border for categorization (like note cards)
- Dark mode: shadow increases to rgba(0,0,0,0.2)

## Icons

Lucide React icons throughout. Size scale:
| Context | Size |
|---------|------|
| Inline with text | h-3.5 w-3.5 (14px) |
| Card headers | h-4 w-4 (16px) |
| Section headers | h-4.5 w-4.5 (18px) |
| Empty states | h-8 w-8 to h-10 w-10 |

## Dark Mode

Full dark mode support via `.dark` class on `<html>`. Strategy:
- Background darkens, not inverts
- Text lightens to ~92% (not pure white)
- Borders become subtle (12% lightness vs 88% in light)
- Primary accent shifts to lighter indigo for contrast
- Shadows become more prominent (dark needs stronger depth cues)

## Anti-patterns

- No purple/violet gradients
- No AI-slop patterns (centered everything, 3-column grids, generic hero copy)
- No heavy box shadows or glassmorphism
- No text below 10px in body content
- No `**bold**` abuse — use hierarchy through size and weight, not inline bold
