# @khums/ui — design system (web)

shadcn/ui-style React DOM components shared by `apps/web` and the future `apps/admin`.
**React Native does not use this package.**

## Design tokens

Defined in `apps/web/src/app/globals.css` as CSS variables, mapped to Tailwind colours with
`@theme inline`. Components use **semantic roles only**, never raw palette colours.

| Role                                                                              | Use                                                            |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `background`, `card`, `muted`, `foreground`, `muted-foreground`                   | Surfaces and text                                              |
| `primary` (+ `-foreground`, `-soft`, `-strong`)                                   | Brand actions, active navigation                               |
| `secondary`, `accent`                                                             | Quiet surfaces and highlights                                  |
| `border`, `input`, `ring`                                                         | Dividers; form-control borders (≥ 3:1 contrast); focus outline |
| `success`, `warning`, `destructive`, `info` (+ `-foreground`, `-soft`, `-strong`) | Status: solid, tinted background, text on tint                 |
| `mock`, `mock-foreground`, `mock-border`                                          | **Reserved** for MOCK / NOT FOR PRODUCTION notices only        |

The theme is light only. A dormant dark theme lives under `:root.dark`; enabling it later needs no
component changes. Fonts are system stacks (no downloads; Arabic-script coverage). All spacing uses
logical properties (`ps-`, `me-`, `start-`), so layouts work in RTL.

## Components (`@khums/ui/components/<name>`)

| Component                                              | Notes                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `button` — `Button`, `buttonVariants`                  | Defaults to `type="button"`. For links, use `cn(buttonVariants(...), extra)` on `<Link>`                            |
| `card`                                                 | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`                                   |
| `badge`, `alert`                                       | `Alert` is **not** a live region unless `live="status" \| "alert"`                                                  |
| `input`, `textarea`, `native-select`, `label`          | Native controls (accessible by default); shared `controlClassName`                                                  |
| `field`                                                | Label + control + description + error, wired with `htmlFor`, `aria-describedby`, `aria-invalid`, `aria-required`    |
| `container`, `page-header`, `separator`, `empty-state` | Layout primitives. `PageHeader` renders the page's single `h1`                                                      |
| `mock-calculation-notice`                              | `MockCalculationNotice` and `MOCK_CALCULATION_LABEL`, the mandated wording for every mock result, report and export |

**Class merging pitfall:** `cva` variant helpers concatenate classes without resolving conflicts.
When overriding a variant class (e.g. `hidden` vs the base `inline-flex`), always wrap the result
in `cn()` (tailwind-merge).

## Tests

`pnpm --filter @khums/ui test` runs Vitest with jsdom and Testing Library: semantics, ARIA wiring,
and the mock label wording.
