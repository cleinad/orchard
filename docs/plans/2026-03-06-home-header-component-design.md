# Home header component (HomeHeader) — design

**Goal**
- Extract the `/home` page header (hamburger + active mentor name + right-side icons) into its own component.
- In desktop view, stretch the header layout so the hamburger sits on the left and the icon cluster sits on the far right.

**Constraints / non-goals**
- Keep the existing header visuals and behavior (same buttons, same navigation).
- Keep the conversation UI width constrained (`max-w-2xl`); only the header should “break out” to full width.

**Approach**
- Create `frontend/app/home/components/HomeHeader.tsx` as a small presentational component.
- Move the header out of the constrained content container:
  - Header wrapper: full width (no `max-w-*`), with consistent horizontal padding.
  - Main content: stays centered with `mx-auto max-w-2xl`.

**Success criteria**
- On wide screens, hamburger aligns to the left edge of the padded viewport and icons align to the right edge of the padded viewport.
- No layout regressions in the chat area.

