# Anees: proposed new look (for approval, then Figma, then code)

Status: proposal. Nothing here is built into the app yet.

## Idea
Anees (أنيس, "companion") is a friendly Qatari learning adventure for children and teachers, Arabic first (RTL).
The look should feel like Qatar and like a game, not like a generic education template.

## Subject-grounded motif
The **nine-point serrated edge of the Qatar flag**, used as the lower edge of the main "continue your lesson" card and
as a section divider. Dune silhouettes inside that card (the map path from the adventure map).

## Colour tokens (5)
| Name   | Hex       | Use                                   |
| ------ | --------- | ------------------------------------- |
| Maroon | `#8A1538` | brand, main buttons, active tab       |
| Night  | `#14122B` | text, dark screens (landing page)     |
| Gold   | `#E9A93B` | XP, rewards, selected difficulty      |
| Sea    | `#1F8A9E` | icons, links, secondary accents       |
| Paper  | `#FBF8F4` | page background (light mode)          |

Soft tints for subject tiles: maroon tint `#FDE9EE`, sea tint `#E2F3F5`, gold tint `#FFF1D2`.

## Type
**Rubik** (supports Arabic and Latin, rounded and friendly): 800 for headlines, 700 for buttons and labels, 500/400 for
body. One family, four weights. Sentence case. Line length under 80 characters.

## Layout (phone first, 390 px wide)
- Bottom tab bar (already built): Home, Reels, Map, Worksheets, Friends. The active tab is a maroon pill.
- **Home:** greeting + level + XP pill; one big maroon "next lesson" card with progress and a "continue" button; subject
  tiles underneath.
- **Worksheets:** lesson-name field; 6 subjects in a 3 x 2 grid (Math, Science, English, Arabic, Islamic Education,
  Social Studies); easy / medium / hard as one segmented control; one maroon "create worksheet" button.
- Reels stays full-bleed video with the action rail; only the colours, fonts and tab bar change.

## Principles
1. One accent per screen: the maroon button.
2. Motion only where it responds to a tap (and one calm entrance per page); respect reduced-motion.
3. Visible keyboard focus, accessible contrast, works at 360 px wide.
4. Follow the Ponytail rule: reuse what exists (theme tokens, components); no new dependencies.
5. Avoid templated looks: no identical shadowed card grids, no ALL-CAPS eyebrows, no decorative arrows.

## Next steps
1. User approves or edits this proposal.
2. Build the screens in Figma (needs the Figma connector available in the session).
3. Implement in `frontend/src/styles/theme.css` and the page components, check at phone and desktop sizes.
4. Push only when the user says "push it".
