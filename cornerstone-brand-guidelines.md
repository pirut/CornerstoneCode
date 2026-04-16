# Cornerstone Brand Identity Guidelines

> **Reference document for development agents.** Use this file as the source of truth for all brand-related decisions when building Cornerstone digital products.

---

## 1. Brand Overview

**Company:** Cornerstone
**Founded:** 2017 by Richard Charlton and Scott Bussard
**Headquarters:** West Palm Beach, Florida
**Ownership:** Family-owned and led
**Industry:** Luxury impact windows and doors (fenestration)
**Tagline:** "Setting New Standards."

### What Cornerstone Does

Cornerstone is South Florida's premier provider of luxury impact windows and doors, specializing in high-performance, design-forward fenestration solutions. They serve architects, builders, and developers working on innovative luxury residential projects.

### Manufacturer Partners

- Brombal
- ES Windows
- Kolbe
- Oikos

### Mission

Empowering visionary architects and builders through design-forward fenestration solutions that elevate the luxury living experience.

### Vision

To be the trusted partner and authority in custom architectural fenestration in South Florida and beyond, setting new standards for luxury, performance, and design excellence.

---

## 2. Brand Values

| Value              | Definition                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Integrity**      | We do the right thing in every situation. No matter the cost.                                                       |
| **Faith**          | Trusting in God to execute our mission.                                                                             |
| **Family**         | We put the team above ourselves in every situation.                                                                 |
| **Teamwork**       | We are only as good as our weakest link and we will work passionately to help everyone in our organization improve. |
| **Responsibility** | The buck stops with us. If there is a question of who’s responsible, we are.                                        |

---

## 3. Brand Personality

- **Refined** — Sophisticated, elegant, aligned with high-end architectural taste
- **Approachable** — Professional yet warm, relationship-driven, easy to work with
- **Visionary** — Forward-thinking, unafraid to champion bold design ideas
- **Reliable** — Grounded, responsive, solutions-oriented, even under pressure

---

## 4. Brand Voice

| Attribute    | Guideline                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------- |
| **Tone**     | Confident, articulate, respectful, conversational                                         |
| **Style**    | Clear, descriptive, inspiring. Use precise language to convey product and design benefits |
| **Language** | Avoid jargon. Speak the language of architects, builders, and luxury clients              |

---

## 5. Brand Messaging

### Primary Message

"Cornerstone provides design-forward, impact-rated window and door solutions for luxury homes in South Florida. We partner with world-class manufacturers to deliver customized fenestration systems that elevate form and function."

### Secondary Messages

- "As a family-owned business, we offer personal service, deep product knowledge, and integrity in every interaction."
- "From concept to installation, Cornerstone helps architects and builders create homes that stand apart."
- "We believe extraordinary architecture deserves extraordinary fenestration—crafted to perform, built to inspire."

---

## 6. Color Palette

### Primary Colors

| Name          | HEX       | RGB           | CMYK        | Pantone | Usage                                 |
| ------------- | --------- | ------------- | ----------- | ------- | ------------------------------------- |
| **Gold**      | `#D1A35A` | 201, 165, 100 | 18/36/73/1  | 872C    | Accent color, logo cornerstone square |
| **Black**     | `#000000` | 0, 0, 0       | 0/0/0/100   | —       | Primary text, logo, dark backgrounds  |
| **White**     | `#FFFFFF` | 255, 255, 255 | 0/0/0/0     | —       | Backgrounds, reversed text            |
| **Limestone** | `#F8F4E4` | 247, 244, 230 | 2/3/9/0     | —       | Light backgrounds, page fills         |
| **Gunmetal**  | `#343D42` | 52, 51, 66    | 75/62/56/47 | —       | Dark alternate backgrounds            |

### CSS Variables

```css
:root {
  --cs-gold: #d1a35a;
  --cs-black: #000000;
  --cs-white: #ffffff;
  --cs-limestone: #f8f4e4;
  --cs-gunmetal: #343d42;
}
```

### Tailwind Config Extension

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        cornerstone: {
          gold: "#D1A35A",
          black: "#000000",
          white: "#FFFFFF",
          limestone: "#F8F4E4",
          gunmetal: "#343D42",
        },
      },
    },
  },
};
```

---

## 7. Typography

### Primary Typeface: Calvino Grande

- Used for headlines, display text, large quotes
- Elegant serif typeface — the brand's signature typographic voice
- **Web fallback:** `Georgia, 'Times New Roman', serif`

### Secondary Typeface: Work Sans

- Used for body copy, subheadings, buttons, captions, small quotes
- Clean sans-serif — functional and flexible
- **Available on Google Fonts:** `https://fonts.google.com/specimen/Work+Sans`

### Font Import (Web)

```html
<link
  href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;600;700&display=swap"
  rel="stylesheet"
/>
```

> **Note:** Calvino Grande is a licensed typeface and must be self-hosted. If unavailable, use a similar elegant serif like `Playfair Display` or `Cormorant Garamond` as a fallback.

### Type Hierarchy

| Element                  | Typeface       | Weight             | Size (Desktop) | Size (Mobile) | Line Height | Tracking          |
| ------------------------ | -------------- | ------------------ | -------------- | ------------- | ----------- | ----------------- |
| **Headline 1**           | Calvino Grande | Light (300)        | 80px           | 72px          | 100%        | -0.36em           |
| **Headline 2**           | Calvino Grande | Light (300)        | 36px           | 24px          | 110%        | -0.18em           |
| **Headline 3**           | Calvino Grande | Light (300)        | 26px           | 24px          | 120%        | 0                 |
| **Subheading / Buttons** | Work Sans      | SemiBold (700)     | 16px           | 16px          | 120%        | 1.2em (uppercase) |
| **Body Copy**            | Work Sans      | Light (300)        | 16px           | 12px          | 120%        | 0                 |
| **Quote (Large)**        | Calvino Grande | Light Italic (300) | 16px           | 12px          | 120%        | 0                 |
| **Quote (Small)**        | Work Sans      | Light (300)        | 26px           | 16px          | 120%        | 0                 |
| **Captions**             | Work Sans      | Regular (400)      | 8px            | 8px           | 120%        | 0                 |

### CSS Type Tokens

```css
/* Headlines — use Calvino Grande if available */
.cs-h1 {
  font-family: "Calvino Grande", Georgia, serif;
  font-weight: 300;
  font-size: 80px;
  line-height: 100%;
  letter-spacing: -0.36em;
}

.cs-h2 {
  font-family: "Calvino Grande", Georgia, serif;
  font-weight: 300;
  font-size: 36px;
  line-height: 110%;
  letter-spacing: -0.18em;
}

.cs-h3 {
  font-family: "Calvino Grande", Georgia, serif;
  font-weight: 300;
  font-size: 26px;
  line-height: 120%;
}

/* Subheadings & Buttons */
.cs-subheading {
  font-family: "Work Sans", sans-serif;
  font-weight: 700;
  font-size: 16px;
  line-height: 120%;
  letter-spacing: 1.2em;
  text-transform: uppercase;
}

/* Body */
.cs-body {
  font-family: "Work Sans", sans-serif;
  font-weight: 300;
  font-size: 16px;
  line-height: 120%;
}

/* Captions */
.cs-caption {
  font-family: "Work Sans", sans-serif;
  font-weight: 400;
  font-size: 8px;
  line-height: 120%;
}
```

### Headline Styling Rules

- Use at least a **200% size difference** between hierarchy levels (e.g., 12pt body → 24pt minimum heading)
- Headlines can incorporate **italics for emphasis** on key words
- Alternatively, use **lowercase italics** for articles, prepositions, and conjunctions ("the," "and," "of," etc.)

---

## 8. Logo

### Formats

- **Full Logo:** Icon + "CORNERSTONE" wordmark (horizontal lockup)
- **Icon Only:** The geometric "C" mark with gold corner square

### Logo Color Rules

| Background                     | Logo Color | Corner Square        |
| ------------------------------ | ---------- | -------------------- |
| Light (Limestone, White)       | Black      | Gold (`#D1A35A`)     |
| Dark (Gunmetal, Black, images) | White      | Gold (`#D1A35A`)     |
| Metallic surfaces              | White      | White at 50% opacity |

### Clearspace

- Minimum clear space around the logo = **50% of the icon height** on all sides
- This is the absolute minimum — more space is preferred

### Minimum Sizes

| Format  | Icon Only   | Full Logo    |
| ------- | ----------- | ------------ |
| Digital | 16px width  | 160px width  |
| Print   | 0.3in width | 2.25in width |

### Logo Misuse — Do NOT:

- Bevel or emboss
- Outline
- Rotate
- Place in a holding shape (rounded rectangle, circle, etc.)
- Stretch or distort
- Add drop shadow
- Rearrange elements
- Multiply / repeat as a pattern
- Use non-brand colors
- Lock up additional text to the logo

---

## 9. Quick Reference for Agents

### When building UI components:

1. **Background colors:** Default to `#F8F4E4` (Limestone) for light pages, `#000000` or `#343D42` for dark sections
2. **Text on light backgrounds:** Use `#000000`
3. **Text on dark backgrounds:** Use `#FFFFFF`
4. **Accent / CTA color:** Use `#D1A35A` (Gold) for buttons, highlights, and interactive elements
5. **Body text:** Work Sans Light (300), 16px, 120% line height
6. **Headlines:** Use a serif font (Calvino Grande or fallback), Light weight
7. **Subheadings / labels:** Work Sans SemiBold, uppercase, wide letter-spacing
8. **Tone of all copy:** Confident, refined, approachable — never salesy or jargon-heavy
9. **Image style:** High-end architectural photography, luxury residential, modern design, warm interior lighting
10. **Overall aesthetic:** Sophisticated, minimal, editorial — think luxury architecture magazine
