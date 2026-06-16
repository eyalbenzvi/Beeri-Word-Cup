# Beeri World Cup — Brand Book

This document is the source of truth for the visual language of the app.
The original brand book was authored in an earlier Claude Code session
(`claude.ai/code/session_01EWxdV4zCMvgrryrcQSgGtA`) which is now archived.
The content here is reconstructed from the design tokens in `src/index.css`
and the design-system overhaul commits (#96 "Redesign UI in Duolingo visual
style", #101 "Design system overhaul + prevent-over-display UX").

When in doubt, **`src/index.css` is canonical** — this doc summarizes it.

## Brand language

Playful, confident, Duolingo-inspired. Feather-Green primary, 3D buttons
with offset shadows, large rounded corners, clear hierarchy. RTL-first
(Hebrew). Tone: warm, casual, never sterile.

## Color palette

| Role | Token | Hex | Use |
|---|---|---|---|
| Primary | `--color-primary` | `#58CC02` | Main CTAs, success, brand accents |
| Primary dark | `--color-primary-dark` | `#46A302` | 3D shadow under primary buttons |
| Primary soft | `--color-primary-soft` | `#F0FFE4` | Quote/note backgrounds, soft alerts |
| Secondary | `--color-secondary` | `#1CB0F6` | Links, info, secondary labels, focus rings |
| Accent | `--color-accent` | `#FF9600` | Warnings, highlights |
| Accent text | `--color-accent-text` | `#8F5400` | High-contrast text on accent-soft |
| Danger | `--color-danger` | `#FF4B4B` | Errors, destructive actions |
| Purple | `--color-purple` | `#CE82FF` | Tertiary, special states |
| Gold / Silver / Bronze | `#FFC800` / `#AFAFAF` / `#CD7F32` | Podium |
| Ink | `--color-ink` | `#3C3C3C` | Body text |
| Ink muted | `--color-ink-muted` | `#5E5E5E` | Secondary text (WCAG AA on bg-soft) |
| Ink light | `--color-ink-light` | `#737373` | Disabled, hint text |
| Surface | `--color-bg` / `--color-bg-soft` | `#FFFFFF` / `#F7F7F7` | Page / muted panels |
| Border | `--color-border` / `--color-border-strong` | `#E5E5E5` / `#D0D0D0` | All dividers |
| WhatsApp | `--color-whatsapp` | `#25D366` | Share-to-WhatsApp button only |

**Rule:** never hardcode hex values in JSX/CSS. Use tokens.
**Rule:** `font-semibold` (600) is off-palette — use `font-bold` (700) or `font-extrabold` (800).

## Typography

Two-font pairing:
- **Heebo** (700, 800) — display headings only. Tighter in Hebrew.
- **Rubik** (400, 500, 700, 800, 900) — all body text.

CSS vars: `--font-heading` and `--font-body`.

Heading sizes use standard Tailwind scale (`text-base`, `text-lg`,
`text-xl`, `text-2xl`, …). Avoid arbitrary `text-[11px]/[12px]/[15px]` —
use the closest standard size.

For sub-`text-xs` micro text (badges, dense table cells, helper captions),
use the two sanctioned utilities `text-2xs` (11px) and `text-3xs` (10px)
defined once in `index.css` — **not** inline `text-[10px]/[11px]`. They are
the official body micro-scale below `text-xs` (12px): monotonic
`text-3xs < text-2xs < text-xs`. Do not introduce further arbitrary pixel
sizes; extend the named scale instead.

Letter-spacing on display headings: `-0.01em`.

## Shape & elevation

- **Border radius:** cards `20px` (default), `16px` (tight), `24px` (large/hero), inputs `14px`, chips `999px`, buttons `16px` (`14px` for sm).
- **Borders:** always `2px` solid (no 1px).
- **3D shadow:** primary buttons use `box-shadow: 0 4px 0 0 <darker>`; on `:active` the shadow collapses and the button shifts down 4px.
- **Card hover:** subtle lift `translateY(-2px)` only when the card itself is the click target.

## Components (canonical classes)

Defined in `src/index.css`:

- **Buttons:** `.btn-duo`, `.btn-duo-primary`, `.btn-duo-blue`, `.btn-duo-orange`, `.btn-duo-danger`, `.btn-duo-ghost`, `.btn-duo-ghost-raised`, `.btn-duo-flat`, `.btn-duo-sm`, `.btn-duo-cta`.
- **Cards:** `.card-duo`, `.card-duo-tight`, `.card-duo-lg`, `.card-duo-hover`.
- **Inputs:** `.input-duo`, `.input-duo-sm`, `.score-input-duo`.
- **Chips:** `.chip-duo`, `.chip-duo.active`, `.chip-duo.active-blue`.
- **Alerts:** `.alert-primary-soft`, `.alert-accent-soft`, `.alert-danger-soft`.
- **Badges:** `.badge-duo` + `-primary` / `-secondary` / `-accent` / `-danger` / `-muted`.
- **Header:** `.header-duo`.
- **Podium:** `.podium-gold`, `.podium-silver`, `.podium-bronze`.

Shared React components (in `src/components/`): `Spinner`, `InlineError`,
`ErrorBanner`, `EmptyState`, `Badge`. Prefer these over inline JSX.

## Motion

Animations: `animate-fade-in` (page enter), `toast-enter` / `toast-exit`,
`animate-slide-in` (drawer), `animate-pop-in` (success / checkmarks),
`animate-tab-bounce` (active nav), `animate-save-flash` (save feedback).

`@media (prefers-reduced-motion: reduce)` collapses all animations to
near-zero — respect it for new animations too.

## Accessibility

- Focus ring: `:focus-visible` outline `3px solid var(--color-secondary)` with `2px` offset.
- Touch targets: minimum 44×44 on `pointer: coarse` (use `.tap-44`).
- Text contrast: ink-muted is intentionally darkened for WCAG AA on `bg-soft`.
- Modals/dialogs: always `role="dialog"` + `aria-modal` + `aria-label` and trap focus (`useFocusTrap`).
- Live status messages: `aria-live="polite"`.

## Layout

- Page max width: `max-w-4xl` (matches header).
- RTL throughout (Hebrew). Use Lucide `ArrowRight` / `ArrowLeft` instead of literal `→` / `←` characters.
- Safe-area: use `.pb-safe` / `.safe-area-bottom` at the bottom of fixed bars.

## Z-index scale

Tokens in `src/index.css`. Never invent z-indexes — pick from:
sticky `20`, header `50`, modal-backdrop `60`, menu `70`, toast `100`,
confirm `9999`, confetti `99999`.

## Voice (copy)

- Hebrew, direct, second-person.
- No exclamation chains, no emojis in product copy unless the surface is celebratory (confetti / podium).
- Lock copy: "המשחקים התחילו — ההגשה נסגרה" (not "נעולה").
- Brand spelling: "בלוג" (not "יומן"), "בארי" (the kibbutz).
