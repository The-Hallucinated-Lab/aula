# Review notes — source: "Computer Networks and SLM.pdf"

Extracted from a handwritten reMarkable annotation (Identity-H subset fonts,
decoded via the per-font ToUnicode CMaps). Reproduced verbatim, grouped as
written, with the interpretation and disposition for each item.

## Programmes

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 1 | what is meetings per courses (programs) | question | Inline help on the field |
| 2 | what is core courses per year | question | Inline help on the field |

## Rooms

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 3 | what does accesible mean | question | Inline help |
| 4 | what is walk time denoting | question | Inline help |
| 5 | what is turnover? | question | Inline help |
| 6 | add floors for a building | feature | Per-building floor count; rooms distributed across floors |
| 7 | add multiple type of rooms for a building | feature | Already supported by room groups; made explicit in the editor |
| 8 | remove capabilities | removal | The 53-chip capability grid is gone; replaced by a short preset list |

## Faculty

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 9 | what is adjunct weekly cap? | question | Inline help |
| 10 | ta weekly cap | question | Inline help |
| 11 | what is a research day | question | Inline help |
| 12 | on sabbatical | question | Inline help |
| 13 | needing accessible rooms | question | Inline help |

## Data

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 14 | add faculty in their concerned department | feature | Add/edit/delete faculty, assigned to a department |
| 15 | add capability of adding which room is available or not on a particular day, in rooms tab | feature | Per-room, per-day availability grid |
| 16 | add delete courses semester wise and department wise | feature | Course editor filtered by department and year/semester |
| 17 | what is student cohort | question | Inline help |

## Constraints

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 18 | add or subtract custom rules and constraints | feature | User-defined constraints on top of the 500 |

## Assistant

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 19 | add assistant in the app | feature | Real assistant, not a canned responder |
| 20 | add gemma 4 e4b as the assistant | feature | Local Ollama `gemma4:e4b`, with the deterministic explainer as fallback |

## Misc

| # | Note | Type | Disposition |
|---|------|------|-------------|
| 21 | ability to add or subtract number of section according to department | feature | Per-department section control |
| 22 | basically everything should be editable | feature | Materialise-on-edit: generated entities become directly editable records |
| 23 | section wise time table | feature | Per-section view and per-section export |
| 24 | faculty mapping from different department based on their department | feature | Cross-department teaching assignment |
| 25 | when adding a faculty under the data tab it should have column to add which courses they will teach | feature | Course assignment column in the faculty editor |
| 26 | under the timetable a section add tabs to see or view timetable perspective of a faculty or a class section | feature | Already present (By cohort / By faculty / By room); verified and kept |
| 27 | redesign the whole ui around the design system of muj design system | UI | Deferred — the instruction for this round was to leave the UI and work on functions |

## Out of scope this round

Item 27 only. Everything else is implemented or answered.
