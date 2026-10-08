# MOTS ShipIt Design System

> Adopted for MOTS ShipIt — 2026-10-08 (rebranded from the prior generic "allNeurons" system)

---

## Product Design Philosophy

MOTS ShipIt follows a **modern, approachable SaaS** philosophy, tuned for an operations console that still has to show dense freight data (load queues, carrier offers, compliance evidence, exception lists) without feeling industrial or cold. The system is:

- **Clear over clinical** — generous whitespace and soft elevation make dense tables and queues feel calm, not like a terminal
- **Systematically scaled** — all values come from a token-based scale; nothing is arbitrary
- **Semantically layered** — raw primitives (All Colors) map to semantic tokens (Token Colors) which map to components
- **Accessible by default** — color steps are chosen for sufficient contrast; primary text on white is near-black (`#070A0E`)
- **Color communicates state, warmly** — grey carries the UI by default; color signals status (success, error, warning, and freight-specific states like SLA urgency) rather than decorating it

This replaces the prior "precision-first, data-dense" framing. The underlying token architecture (colors → semantic tokens → components) is unchanged; the surface feel is lighter, with softer corners and subtle shadows instead of flat, sharp edges.

---

## Color System

### Architecture

The color system has two layers:

1. **Primitive palette** (`All Colors/…`) — raw 10-step scales, the source of truth
2. **Semantic tokens** (`Token colors/…`) — role-based aliases that map primitives to meaning

Always reference semantic tokens in UI code. Use raw primitives only when defining token values.

---

### Primitive Palette

Each color family runs a 10-step scale: `900 → 800 → 700 → 600 → ★500 → 400 → 300 → 200 → 100 → 50`
The `★` mark on 500 indicates the **primary base** for that family.

#### Primary Blue (Brand Primary) — unchanged
| Step | Hex |
|------|-----|
| 900  | `#082A5E` |
| 800  | `#0A367B` |
| 700  | `#0D469E` |
| 600  | `#0044AE` |
| ★500 | `#115ACB` |
| 400  | `#89B7FF` |
| 300  | `#6196EA` |
| 200  | `#92B7F0` |
| 100  | `#B6CFF5` |
| 50   | `#E7EFFC` |

Kept as-is: already accessible, already fully tokened, and reads as trustworthy/operational — a good fit for a compliance-heavy platform.

#### Grey (Neutral Foundation)
| Step | Hex |
|------|-----|
| ★900 | `#070A0E` |
| 800  | `#151719` |
| 700  | `#25272B` |
| 600  | `#2C2F32` |
| 500  | `#4A4C4F` |
| 400  | `#5E6062` |
| 300  | `#8F9193` |
| 200  | `#C1C2C3` |
| 100  | `#DADADB` |
| 50   | `#F0F0F1` |
| 25   | `#FAFAFA` |

> Grey has an extra `25` step (near-white surface) unique to this family.

#### Green (Success / Positive / Booked)
| Step | Hex |
|------|-----|
| 900  | `#084406` |
| 800  | `#0A5908` |
| 700  | `#0D720A` |
| 600  | `#11930D` |
| ★500 | `#13A10E` |
| 400  | `#42B43E` |
| 300  | `#61C05E` |
| 200  | `#92D490` |
| 100  | `#B6E2B4` |
| 50   | `#E7F6E7` |

Freight usage: booked/confirmed load, passed compliance check, carrier accepted.

#### Red (Error / Danger / Blocked / Fraud Risk)
| Step | Hex |
|------|-----|
| 900  | `#581618` |
| 800  | `#731D1F` |
| 700  | `#942528` |
| 600  | `#BE2F33` |
| ★500 | `#D13438` |
| 400  | `#DA5D60` |
| 300  | `#E0777A` |
| 200  | `#EAA2A3` |
| 100  | `#F1C0C1` |
| 50   | `#FAEBEB` |

Freight usage: failed compliance gate, blocked carrier, fraud/high-risk flag, double-booking prevention errors. Compliance/fraud risk reuses this scale rather than a dedicated color family — kept to avoid palette sprawl, since both are fundamentally "stop" states.

#### Yellow (Warning / Attention)
| Step | Hex |
|------|-----|
| 900  | `#854D00` |
| 800  | `#B36800` |
| 700  | `#DB8000` |
| 600  | `#FA9200` |
| ★500 | `#FFAA33` |
| 400  | `#FFC16B` |
| 300  | `#FFD294` |
| 200  | `#FFE3BD` |
| 100  | `#FFF2E0` |
| 50   | `#FFF9F0` |

Freight usage: general attention states — stale data warning, policy conflict needing review, non-critical validation issues. Distinct from Saffron (below), which is reserved specifically for SLA/countdown urgency.

#### Saffron (SLA / Countdown Urgency) — new
| Step | Hex |
|------|-----|
| 900  | `#6B3900` |
| 800  | `#8C4B00` |
| 700  | `#AD5E00` |
| 600  | `#D27300` |
| ★500 | `#F2A900` |
| 400  | `#F5BD4D` |
| 300  | `#F7CD79` |
| 200  | `#FADDA3` |
| 100  | `#FCEBC9` |
| 50   | `#FEF6E8` |

Freight usage: time-pressure states tied to the PRD's SLA/countdown requirements — exception-queue items approaching their resolution deadline (e.g. the 5-minute low-confidence-speech review window, the reservation-expiry countdown for a preferred carrier). Deliberately distinct from Yellow (general warning) and Orange (secondary accent) so urgency reads as its own signal, not a generic warning.

#### Violet (Accent / Highlight)
| Step | Hex |
|------|-----|
| 900  | `#380070` |
| 800  | `#5700AD` |
| 700  | `#6600CC` |
| 600  | `#7000E0` |
| ★500 | `#7F00FF` |
| 400  | `#B870FF` |
| 300  | `#D1A3FF` |
| 200  | `#E3C7FF` |
| 100  | `#F2E5FF` |
| 50   | `#F7F0FF` |

#### Orange (Secondary Accent)
| Step | Hex |
|------|-----|
| 900  | `#802400` |
| 800  | `#B33300` |
| 700  | `#D63D00` |
| 600  | `#E63900` |
| ★500 | `#FF4405` |
| 400  | `#FF956B` |
| 300  | `#FFBA9E` |
| 200  | `#FFD3C2` |
| 100  | `#FFE9E0` |
| 50   | `#FFF4F0` |

Reserved for secondary accents/highlights unrelated to SLA urgency (e.g. "new" badges, promotional callouts) — kept separate from Saffron to avoid ambiguity between "something urgent" and "something new."

---

### Semantic Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `Token colors/Text/gray/text-gray-primary (900)` | `#070A0E` | Primary body text, headings |
| `Token colors/Text/gray/text-gray-secondary (500)` | `#4A4C4F` | Secondary/muted text, captions, labels |
| `Token colors/Background/gray/bg-white-primary (F-900)` | `#FFFFFF` | Primary page/card background |
| `Token colors/Status/urgency/sla-countdown (500)` | `#F2A900` | SLA/countdown urgency badges, timers |
| `Token colors/Status/risk/blocked-fraud (500)` | `#D13438` | Compliance-blocked and fraud-risk carrier states |

> Additional semantic tokens (borders, interactive states, surface layers) follow the same naming pattern: `Token colors/{category}/{subcategory}/{role}`.

---

### Color Usage Rules

1. **Text primary** → Grey 900 (`#070A0E`) on light backgrounds
2. **Text secondary** → Grey 500 (`#4A4C4F`) for supporting copy, metadata, labels
3. **Interactive / brand** → Primary Blue ★500 (`#115ACB`) for CTAs, links, focus rings
4. **Success states** → Green ★500 (`#13A10E`), background tint Green 50 — booked loads, passed compliance
5. **Error / blocked / fraud-risk states** → Red ★500 (`#D13438`), background tint Red 50 — failed compliance gate, blocked carrier, fraud flag
6. **General warning states** → Yellow ★500 (`#FFAA33`), background tint Yellow 50 — stale data, non-critical review flags
7. **SLA / countdown urgency** → Saffron ★500 (`#F2A900`), background tint Saffron 50 — exception-queue deadlines, reservation-expiry countdowns
8. **Surfaces** → White (`#FFFFFF`) for cards, modals; Grey 25 (`#FAFAFA`) for page bg; Grey 50 (`#F0F0F1`) for subtle dividers
9. **Never use raw primitive tokens in component code** — always go through the semantic layer

---

## Typography Hierarchy

**Font families:**
- `Inter Display` — all UI text: headings, body copy, labels, captions
- `JetBrains Mono` — tabular/identifier data only: load numbers, USDOT/MC numbers, rate and currency figures, booking/confirmation IDs. Monospace digits keep these columns aligned and scannable in dense tables and the exception queue.

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Font | CSS |
|------|------|--------|-------------|----------------|------|-----|
| H1 | ~48px | 700 | ~56px | 0 | Inter Display | *inferred* |
| H2 | ~36px | 700 | ~44px | 0 | Inter Display | *inferred* |
| H3 | ~30px | 600 | ~38px | 0 | Inter Display | *inferred* |
| H4 | ~28px | 600 | ~36px | 0 | Inter Display | *inferred* |
| **H5 / Medium** | **24px** | **500** | **32px** | **0** | Inter Display | `font-size:24px; font-weight:500; line-height:32px` |
| **Paragraph Large / Medium** | **16px** | **500** | **24px** | **0** | Inter Display | `font-size:16px; font-weight:500; line-height:24px` |
| **Paragraph Small / Regular** | **12px** | **400** | **18px** | **0** | Inter Display | `font-size:12px; font-weight:400; line-height:18px` |
| **Data / Mono** | **14px** | **500** | **20px** | **0** | JetBrains Mono | `font-size:14px; font-weight:500; line-height:20px; font-family:'JetBrains Mono', monospace` |

> Rows marked *inferred* follow the geometric progression of confirmed steps. Verify against the typography page in Figma.

### Typography Rules

1. **Section labels / category headings** → H5 Medium (24/32, weight 500)
2. **Body copy / list items / data labels** → Paragraph Large Medium (16/24, weight 500)
3. **Captions / hex values / metadata** → Paragraph Small Regular (12/18, weight 400)
4. **Load numbers, MC/DOT numbers, rate figures, booking IDs** → Data/Mono (14/20, JetBrains Mono, weight 500)
5. **Color values in labels** always render in Grey 500; label names in Grey 900
6. **No letter-spacing adjustments** — system is letter-spacing: 0 throughout
7. **Line height is tight** — ratio ≈ 1.3–1.5. Never add extra leading outside the type scale.
8. **Two typefaces only** — Inter Display for all UI text, JetBrains Mono only for the tabular/identifier data listed above. Never mix beyond this split.

---

## Spacing Rhythm

The spacing system is token-based on a **4px base unit**.

### Known Spacing Tokens

| Token | Value |
|-------|-------|
| `Spacing/Spacing 0px` | `0px` |
| `Spacing/Spacing 4px` | `4px` |
| `Spacing/Spacing 64px` | `64px` |
| `Spacing/Spacing 80px` | `80px` |

### Inferred Scale (4px grid)

```
4px   — micro gap (between color swatches, inline chips)
8px   — small gap (label row stacking)
12px  — component internal padding
16px  — base unit (common padding, small gaps)
24px  — section sub-grouping gap
32px  — component-to-component gap
40px  — section gap within a page zone
48px  — page vertical padding
64px  — page horizontal padding
```

> Page padding was reduced from the prior system's 96px/112px to 48px/64px — part of the "lighter, modern SaaS" shift. The old values suited a sparse, monumental precision tool; an ops console that lives in dense tables and queues reads better with tighter outer padding and the same 4px internal rhythm.

### Spacing Rules

1. **All spacing values must be multiples of 4px**
2. **Page-level padding**: 64px horizontal, 48px vertical
3. **Section gaps**: 40px between major content groups
4. **Sub-section gaps**: 24px between labeled groups and their content
5. **Item gaps**: 8px between label rows; 4px between color swatches
6. **Inline gaps**: 2px for stacked text within a single label block

---

## Border Radius Rules

Rounded up from the prior system as part of the lighter, more approachable SaaS feel.

| Context | Radius |
|---------|--------|
| Cards / panels | `12px` |
| Buttons (default) | `8px` |
| Tags / badges | `6px` |
| Inputs | `8px` |
| Modals | `16px` |
| Color swatches (as seen in palette) | `0px` (flat/square) |
| Avatars / image containers | `50%` (full circle) |

> Default to `8px` when in doubt.

---

## Elevation / Shadows

New in this revision — the prior system was intentionally flat (depth only via background-color steps). A lighter SaaS feel needs soft elevation to separate cards, modals, and dropdowns from the page without hard borders.

| Level | Usage | CSS |
|-------|-------|-----|
| 0 — Flat | Page background, inline elements | none |
| 1 — Resting | Cards, table rows on hover | `0 1px 2px rgba(7,10,14,0.06), 0 1px 1px rgba(7,10,14,0.04)` |
| 2 — Raised | Dropdowns, popovers, tooltips | `0 4px 8px rgba(7,10,14,0.08), 0 2px 4px rgba(7,10,14,0.04)` |
| 3 — Overlay | Modals, sheets | `0 12px 24px rgba(7,10,14,0.12), 0 4px 8px rgba(7,10,14,0.06)` |

Rules:
1. Shadows use the Grey 900 hue at low opacity — never a pure black shadow
2. Borders (Grey 100/200) are still preferred for simple separation (table rows, list items); reserve shadow for anything that visually floats above the page (cards, modals, popovers)
3. Never combine a heavy border *and* a heavy shadow on the same element

---

## Layout Structure

### Page Canvas

```
┌────────────────────────────────────────────────────┐
│  padding: 48px top/bottom, 64px left/right          │
│  ┌──────────────────────────────────────────────┐  │
│  │  Content area (full-width flex column)       │  │
│  │  gap: 40px between major sections             │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### Section Structure

Each content section follows:
```
[Section Header — H5 Medium, full width]
  gap: 24px
[Content grid — flex wrap, gap: 4px, items stretch to fill]
```

### Grid / Flex Patterns

- **Content sections**: `flex-col`, `gap: 24px`, `width: 100%`
- **Color/item grids**: `flex-wrap`, `gap: 4px`, each item `flex: 1 0 0`, `min-width: 1px`
- **Label blocks**: `flex-col`, `gap: 2px`
- **Top-level page**: `flex-col`, `gap: 40px`, `width: 100%`

### Responsive Behavior

The wrapping flex grid (`flex-wrap`) allows color swatches and card grids to reflow at smaller widths. The `flex: 1 0 0` pattern ensures equal-width columns that shrink uniformly.

---

## Component Patterns

### Color Swatch Block (`_Color blank`)

```
[Color swatch — h:60px, w:full, background = color value]
  gap: 8px
[Label group]
  [Step number — Paragraph Large Medium, Grey 900]
  [Hex value — Paragraph Small Regular, Grey 500]
```

### Section Block

```
[Section title — H5 Medium, Grey 900]
  gap: 24px
[Swatch row — flex-wrap, gap:4px]
  [Color swatch block × 10]
```

### Reusable Pattern: Labeled Value Row

Used anywhere a value needs a name + sub-label (not just colors):
```
[Primary label — 16px Medium, Grey 900]
[Secondary value — 12px Regular, Grey 500]
```
Gap between rows: `2px`.

### SLA Countdown Badge — new

```
background: Saffron 50
border: 1px solid Saffron 200
text: Saffron 700, Data/Mono 14px (the countdown value) + Paragraph Small Regular 12px (the label)
border-radius: 6px
padding: 2px 8px
```
Used in the exception queue (FR-15) for time remaining before an SLA breach. Switch to Red 50/200/700 once the deadline has passed.

### Compliance / Risk Status Badge — new

```
background: [Green|Red] 50
border: 1px solid [Green|Red] 200
text: [Green|Red] 700, Paragraph Small Medium
border-radius: 6px
padding: 2px 8px
icon: check (Green) or block (Red), 12px
```
Green = passed identity/authority/insurance checks. Red = blocked carrier or fraud flag — reuses the error scale per the Color Usage Rules above.

---

## Interaction / Motion Language

### Principles

- **Purposeful, not decorative** — animation exists only to communicate state change or spatial relationship
- **Fast** — transitions ≤ 150ms for micro-interactions (hover, focus), ≤ 250ms for panel/modal transitions
- **Easing** — ease-out for elements entering the screen; ease-in for elements leaving; ease-in-out for position shifts

### Recommended Values

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button hover / focus ring | `100ms` | `ease-out` |
| Input focus border | `100ms` | `ease-out` |
| Dropdown / tooltip appear | `150ms` | `ease-out` |
| Modal / sheet enter | `200ms` | `ease-out` |
| Modal / sheet exit | `150ms` | `ease-in` |
| Page transitions | `250ms` | `ease-in-out` |
| Skeleton → content | `300ms` | `ease-in-out` |
| SLA countdown tick (Saffron → Red at breach) | `200ms` | `ease-in-out` |

### State Colors (Motion-adjacent)

| State | Background tint | Border | Text |
|-------|----------------|--------|------|
| Default | White / Grey 25 | Grey 100 | Grey 900 |
| Hover | Grey 50 | Grey 200 | Grey 900 |
| Focus | White | Blue 500 (2px) | Grey 900 |
| Active / Pressed | Grey 100 | Grey 300 | Grey 900 |
| Disabled | Grey 25 | Grey 100 | Grey 400 |
| Error / Blocked | Red 50 | Red 500 | Red 700 |
| Success / Booked | Green 50 | Green 500 | Green 700 |
| Warning | Yellow 50 | Yellow 500 | Yellow 800 |
| SLA Urgency | Saffron 50 | Saffron 500 | Saffron 700 |

---

## Visual Principles

1. **Clarity over density-for-its-own-sake** — whitespace and soft elevation separate information, not just borders
2. **Hierarchy through weight and size, not decoration** — differentiate levels via font weight (400 vs 500) and size, not color or ornament
3. **Color = signal** — grey is the default; color communicates status, urgency, or action
4. **Soft depth** — subtle shadows (see Elevation) plus background-color steps (Grey 25 → White); no harsh borders where elevation can do the job
5. **Systematic consistency** — if a value isn't in the token list, it doesn't belong in the UI

---

## UI Consistency Rules

1. **Use semantic tokens** — never hardcode hex values in component styles; always reference `Token colors/…`
2. **Type roles are fixed** — don't mix type scale roles (e.g. don't use H5 for body copy)
3. **Spacing must be on-grid** — every gap, padding, and margin must be a multiple of 4px
4. **Color families for status** — Blue=brand/info, Green=success/booked, Red=error/blocked/fraud-risk, Yellow=general warning, Saffron=SLA/countdown urgency, Violet=accent, Orange=secondary accent (new/promotional)
5. **Grey 900 for primary text, Grey 500 for secondary** — do not use other grey steps for body text
6. **White for elevated surfaces, Grey 25 for page background, Grey 50 for subtle dividers/hover**
7. **Two typefaces only** — Inter Display for UI text, JetBrains Mono for load numbers/IDs/rate figures — no other fonts
8. **0 letter-spacing** — do not add tracking unless explicitly specified in a style
9. **Color swatches are square** (radius: 0) — do not round swatch/palette UI elements
10. **Section titles use H5 (24px Medium)** — not H4 or any other step
11. **Shadows over heavy borders** for anything that floats above the page (cards, modals, popovers); borders remain fine for simple row/list separation

---

## Reusable Patterns

### Semantic Status Badge

```
background: [Color] 50
border: 1px solid [Color] 200
text: [Color] 700, Paragraph Small Medium
border-radius: 6px
padding: 2px 8px
```
Replace `[Color]` with Green/Red/Yellow/Saffron/Blue based on status.

### Data Label Pair

```html
<div style="display:flex; flex-direction:column; gap:2px;">
  <span style="font:500 16px/24px 'Inter Display'; color:#070A0E;">Label</span>
  <span style="font:400 12px/18px 'Inter Display'; color:#4A4C4F;">Sub-value</span>
</div>
```

### Freight Data Pair (mono value)

```html
<div style="display:flex; flex-direction:column; gap:2px;">
  <span style="font:400 12px/18px 'Inter Display'; color:#4A4C4F;">Load #</span>
  <span style="font:500 14px/20px 'JetBrains Mono', monospace; color:#070A0E;">LD-294817</span>
</div>
```

### Section Block

```html
<section style="display:flex; flex-direction:column; gap:24px; width:100%;">
  <h2 style="font:500 24px/32px 'Inter Display'; color:#070A0E; margin:0;">Section Title</h2>
  <!-- content -->
</section>
```

### Page Wrapper

```html
<main style="
  padding: 48px 64px;
  display: flex;
  flex-direction: column;
  gap: 40px;
  background: #FAFAFA;
">
  <!-- sections -->
</main>
```

### Flex-Wrap Item Grid

```html
<div style="display:flex; flex-wrap:wrap; gap:4px; align-items:flex-start; width:100%;">
  <!-- each item: flex: 1 0 0; min-width: 1px -->
</div>
```

---

## Reports Sub-theme (Stretch — Good to Have, Not MVP)

A distinct, optional theme scoped **only** to data-visualization/report screens (e.g. a load-estimate confidence/evidence breakdown, carrier-offer sensitivity analysis, compliance evidence bundles). Everything else in the app keeps the core system above (Blue primary, Inter Display + JetBrains Mono, Saffron SLA urgency, etc.) completely unchanged. This theme is explicitly a later/stretch addition — do not apply it to the core ops console, forms, or tables.

**Inspiration:** [CubeRight](https://getcuberight.com) — a predictive-cubing/logistics-analytics product with a confidence-scored measurement queue, a sensitivity table, a provenance/source bar, and a decision-lock timeline. Colors and fonts below were read directly from their live site's CSS, not guessed.

### Report Theme Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `report-navy-900` | `#0A0D22` | Dark anchor — report section headers, dark report backgrounds |
| `report-teal-500` | `#0A6C61` | Primary accent for the report theme — section markers, primary data series |
| `report-amber-500` | `#E3AC49` | Highlight color for "this is where the value is" figures (e.g. the carrier/lane driving the biggest cost swing) |
| `report-amber-600` | `#C6892C` | Darker amber — amber text on light backgrounds |
| `report-amber-100` | `#F4CD78` | Light amber tint — amber background fills |
| `report-gray-700` | `#4B5060` | Report body text |
| `report-gray-500` | `#686E7E` | Report secondary/muted text |
| `report-gray-300` | `#A1A7B4` | Report captions |
| `report-gray-50` | `#E6E8EC` | Report surface/background tint |

### Typography Exception

Within the Reports sub-theme only: `Newsreader` (serif) for report headings/titles, to read as more editorial/analytical than the ops console. Body copy and data inside reports still use Inter Display and JetBrains Mono per the core system's type scale — **Newsreader is for headings only, and only inside this theme.** This is the one exception to the core rule "two typefaces only" — it does not apply outside report screens.

### Report Component Patterns

Each pattern below maps to a real requirement from the MOTS ShipIt PRD, not just decoration:

**Confidence Score Badge** — maps to FR-07 (term extraction confidence) and FR-11 (offer comparison explanations)
```
background: report-gray-50
border: 1px solid report-teal-500 (20% opacity)
text: report-teal-500, Data/Mono (the % value) + Paragraph Small Regular (the label)
border-radius: 6px
padding: 4px 10px
```

**Sensitivity Table** — shows how an input change (rate ceiling, carrier mix, fuel surcharge) affects an outcome; maps to policy testing (FR-02) and analytics (FR-18)
```
header row: report-navy-900 text, Newsreader, 16px
body rows: alternating white / report-gray-50
delta cells: report-amber-600 text when the change is value-positive, Red 700 when value-negative
```

**Provenance / Source Bar** — a thin strip citing where each figure came from; maps directly to the PRD's evidence/audit requirements (FR-15, FR-17, and the Auditability NFR)
```
background: report-navy-900
text: white, Paragraph Small Regular
icon: source/link icon, 12px, report-amber-500
```

**Decision-Lock Timeline** — a horizontal timeline of when inputs lock vs. when they're still changeable; maps to the same SLA/exception-countdown concept as the Saffron urgency color in the core system
```
track: report-gray-50
locked segment: report-navy-900
open segment: report-teal-500
countdown marker: report-amber-500 (ties to core Saffron urgency semantics, translated into this theme's palette)
```

### CSS Custom Properties (scoped, additive)

```css
[data-theme="reports"] {
  --report-navy-900:   #0A0D22;
  --report-teal-500:   #0A6C61;
  --report-amber-600:  #C6892C;
  --report-amber-500:  #E3AC49;
  --report-amber-100:  #F4CD78;
  --report-gray-700:   #4B5060;
  --report-gray-500:   #686E7E;
  --report-gray-300:   #A1A7B4;
  --report-gray-50:    #E6E8EC;
  --report-font-heading: 'Newsreader', serif;
}
```

Apply `data-theme="reports"` only on the wrapping container of a report/analytics screen — never at the document root, so the core theme stays the default everywhere else.

---

## Implementation Guidance

### CSS Custom Properties Setup

```css
/* Primitives — define once, reference via semantic tokens */
:root {
  /* Grey */
  --color-grey-900: #070A0E;
  --color-grey-800: #151719;
  --color-grey-700: #25272B;
  --color-grey-600: #2C2F32;
  --color-grey-500: #4A4C4F;
  --color-grey-400: #5E6062;
  --color-grey-300: #8F9193;
  --color-grey-200: #C1C2C3;
  --color-grey-100: #DADADB;
  --color-grey-50:  #F0F0F1;
  --color-grey-25:  #FAFAFA;

  /* Blue */
  --color-blue-900: #082A5E;
  --color-blue-800: #0A367B;
  --color-blue-700: #0D469E;
  --color-blue-600: #0044AE;
  --color-blue-500: #115ACB;
  --color-blue-400: #89B7FF;
  --color-blue-300: #6196EA;
  --color-blue-200: #92B7F0;
  --color-blue-100: #B6CFF5;
  --color-blue-50:  #E7EFFC;

  /* Green */
  --color-green-900: #084406;
  --color-green-800: #0A5908;
  --color-green-700: #0D720A;
  --color-green-600: #11930D;
  --color-green-500: #13A10E;
  --color-green-400: #42B43E;
  --color-green-300: #61C05E;
  --color-green-200: #92D490;
  --color-green-100: #B6E2B4;
  --color-green-50:  #E7F6E7;

  /* Red */
  --color-red-900: #581618;
  --color-red-800: #731D1F;
  --color-red-700: #942528;
  --color-red-600: #BE2F33;
  --color-red-500: #D13438;
  --color-red-400: #DA5D60;
  --color-red-300: #E0777A;
  --color-red-200: #EAA2A3;
  --color-red-100: #F1C0C1;
  --color-red-50:  #FAEBEB;

  /* Yellow */
  --color-yellow-900: #854D00;
  --color-yellow-800: #B36800;
  --color-yellow-700: #DB8000;
  --color-yellow-600: #FA9200;
  --color-yellow-500: #FFAA33;
  --color-yellow-400: #FFC16B;
  --color-yellow-300: #FFD294;
  --color-yellow-200: #FFE3BD;
  --color-yellow-100: #FFF2E0;
  --color-yellow-50:  #FFF9F0;

  /* Saffron — SLA / countdown urgency */
  --color-saffron-900: #6B3900;
  --color-saffron-800: #8C4B00;
  --color-saffron-700: #AD5E00;
  --color-saffron-600: #D27300;
  --color-saffron-500: #F2A900;
  --color-saffron-400: #F5BD4D;
  --color-saffron-300: #F7CD79;
  --color-saffron-200: #FADDA3;
  --color-saffron-100: #FCEBC9;
  --color-saffron-50:  #FEF6E8;

  /* Violet */
  --color-violet-900: #380070;
  --color-violet-800: #5700AD;
  --color-violet-700: #6600CC;
  --color-violet-600: #7000E0;
  --color-violet-500: #7F00FF;
  --color-violet-400: #B870FF;
  --color-violet-300: #D1A3FF;
  --color-violet-200: #E3C7FF;
  --color-violet-100: #F2E5FF;
  --color-violet-50:  #F7F0FF;

  /* Orange — secondary accent (new/promotional, not urgency) */
  --color-orange-900: #802400;
  --color-orange-800: #B33300;
  --color-orange-700: #D63D00;
  --color-orange-600: #E63900;
  --color-orange-500: #FF4405;
  --color-orange-400: #FF956B;
  --color-orange-300: #FFBA9E;
  --color-orange-200: #FFD3C2;
  --color-orange-100: #FFE9E0;
  --color-orange-50:  #FFF4F0;

  /* Semantic tokens */
  --text-primary:   var(--color-grey-900);
  --text-secondary: var(--color-grey-500);
  --bg-primary:     #FFFFFF;
  --bg-surface:     var(--color-grey-25);
  --bg-subtle:      var(--color-grey-50);
  --brand:          var(--color-blue-500);
  --sla-urgency:    var(--color-saffron-500);
  --risk-blocked:   var(--color-red-500);

  /* Spacing */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Elevation */
  --shadow-1: 0 1px 2px rgba(7,10,14,0.06), 0 1px 1px rgba(7,10,14,0.04);
  --shadow-2: 0 4px 8px rgba(7,10,14,0.08), 0 2px 4px rgba(7,10,14,0.04);
  --shadow-3: 0 12px 24px rgba(7,10,14,0.12), 0 4px 8px rgba(7,10,14,0.06);
}
```

### Typography Classes

```css
.type-h5 {
  font-family: 'Inter Display', sans-serif;
  font-size: 24px;
  font-weight: 500;
  line-height: 32px;
  letter-spacing: 0;
}

.type-body-lg {
  font-family: 'Inter Display', sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  letter-spacing: 0;
}

.type-body-sm {
  font-family: 'Inter Display', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  letter-spacing: 0;
}

.type-data-mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0;
}
```

### Figma Token Path Convention

When reading or writing to Figma:
- Primitives: `All Colors/{Family}/{Step}` e.g. `All Colors/Blue/★ 500`
- Semantic: `Token colors/{category}/{subcategory}/{role}` e.g. `Token colors/Text/gray/text-gray-primary (900)`
- Spacing: `Spacing/Spacing {N}px` e.g. `Spacing/Spacing 4px`
- Typography: `Typography/{Role}/{Weight}` e.g. `Typography/H5/Medium`

---

## Quick Reference Card

```
FONT-UI     Inter Display
FONT-MONO   JetBrains Mono (load #, MC/DOT #, rates, confirmation IDs only)
TEXT-1      #070A0E (Grey 900)
TEXT-2      #4A4C4F (Grey 500)
BG          #FFFFFF (White)
SURFACE     #FAFAFA (Grey 25)
SUBTLE      #F0F0F1 (Grey 50)
BRAND       #115ACB (Primary Blue 500)
SUCCESS     #13A10E (Green 500)      — booked / passed compliance
ERROR       #D13438 (Red 500)        — blocked / fraud risk
WARNING     #FFAA33 (Yellow 500)     — general attention
SLA-URGENCY #F2A900 (Saffron 500)    — countdown / exception deadline
ACCENT      #7F00FF (Violet 500)
SECONDARY   #FF4405 (Orange 500)     — new / promotional only

PAGE-PAD    64px H / 48px V
SECTION-GAP 40px
SUBSEC-GAP  24px
ITEM-GAP    8px
MICRO-GAP   4px

RADIUS-SM   6px
RADIUS-MD   8px
RADIUS-LG   12px
RADIUS-XL   16px

SHADOW-1    0 1px 2px rgba(7,10,14,.06)   — cards
SHADOW-2    0 4px 8px rgba(7,10,14,.08)   — dropdowns/popovers
SHADOW-3    0 12px 24px rgba(7,10,14,.12) — modals

REPORTS SUB-THEME (stretch, not MVP — report/analytics screens only, data-theme="reports")
  NAVY      #0A0D22   TEAL     #0A6C61
  AMBER     #E3AC49   AMBER-DK #C6892C   AMBER-LT #F4CD78
  HEADING FONT  Newsreader (serif, headings only — body stays Inter Display/JetBrains Mono)
```
