# RetryProof design system

The three concept images in this directory are the visual specification for the product's import, failure, and verification states.

## Direction

- Theme: deterministic workflow flight-test laboratory.
- Background: true near-black navy, never cream or softened gray.
- Surfaces: cool slate with thin steel-blue borders and open split-pane layouts.
- Primary accent: electric cyan for selection, focus, controls, and neutral traces.
- Semantic accents: signal red for observed failures; restrained green for verified results.
- Typography: geometric grotesk for headings and UI; compact monospace for hashes, JSON paths, trace times, and contracts.
- Density: serious developer-tool density with generous pane gutters and readable technical metadata.
- Shape: 4-8px radii, fine rails and tables, no nested rounded bento cards.

## Tokens

| Token | Value |
|---|---|
| `--bg` | `#050d17` |
| `--bg-raised` | `#081522` |
| `--panel` | `#0b1928` |
| `--panel-strong` | `#0f2133` |
| `--border` | `#26384b` |
| `--border-bright` | `#3e5870` |
| `--text` | `#f4f8fc` |
| `--text-muted` | `#94a8bb` |
| `--cyan` | `#20c7ff` |
| `--red` | `#ff5d60` |
| `--green` | `#6edb66` |
| `--amber` | `#f4bd5f` |

## Component families

- App shell: 64px top bar, 220px navigation rail on large screens, one open workspace.
- Workflow graph: rectangular node stations connected by thin directed rails; selected/failing/inserted variants.
- Trace table: ordered events with time, delivery, node, effect, and response columns.
- Inspector: evidence paths labeled observed, inferred, or unknown.
- Contract editor: human-readable invariant plus structured oracle preview and approval boundary.
- Scenario selector: radio/list treatment, never decorative chips.
- Repair review: RFC 6902 diff, artifact list, source-hash binding, approval control.
- Verification matrix: fixed before/after columns with explicit counts and pass/fail icons.
- Evidence receipt: immutable hashes, coverage, limitations, and downloads.

## Interaction and accessibility

- Every primary action has a visible focus ring and at least a 44px target.
- Red/green are always paired with an icon and text.
- Loading is announced with `aria-live`; long-running states retain the last completed data.
- Graphs and timelines always have text/table equivalents.
- Motion is limited to progress rails and respects `prefers-reduced-motion`.
- Mobile collapses the navigation to a horizontal progress rail and panes to a linear task flow.

## Allowed first-viewport copy

- RetryProof
- Mock-only lab
- Break your automation before retries do.
- Try refund demo
- Upload workflow
- No real external action is performed.
- Green means the approved invariant passed the declared scenarios.
