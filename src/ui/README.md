# `src/ui/`

Intentionally minimal: `button.tsx`, `card.tsx`, `dialog.tsx`, `menubar.tsx`. This is not a component library
— per `docs/ARCHITECTURE.md` §1.1 ("No heavy component library"), the house style is
shadcn/ui-style copy-in primitives, not a shared design-system package.

Most feature-specific styling lives inline in feature screens (`src/features/*`), applied
directly against the design tokens in `docs/tokens.css` and documented in
`docs/BRAND-DESIGN-LANGUAGE.md`. Read that doc before adding a new primitive here or changing
an existing one — the belt-rank ramp and the fold overlay are the whole visual vocabulary the
app has; don't introduce new color or ornament to make a screen feel more finished (see
`docs/ux-backlog.md`'s "Traps specific to this queue" for the same rule stated for UX-loop
work).

If you find yourself duplicating a styled element across three or more feature screens, that's
the signal to promote it into a primitive here — not before.

`menubar.tsx` is the Radix Menubar copy-in primitive used by the Browse Workbench. Its content
is portal-mounted with an internal height limit, and `MenubarFormField` stops keydown bubbling so
inputs and selects inside a menu keep focus instead of triggering menu typeahead.
