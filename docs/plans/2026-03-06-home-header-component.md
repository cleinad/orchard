# Home header component implementation plan

> **Goal:** Extract the `/home` header into `HomeHeader` and make the header span full width on desktop while keeping the chat content constrained.

**Architecture**
- New component `HomeHeader` renders the header row and receives callbacks for the hamburger and mentor browser actions.
- `frontend/app/home/page.tsx` becomes responsible for page layout: full-width header wrapper + centered `max-w-2xl` content.

**Tech stack**
- Next.js (App Router), React, Tailwind CSS

---

### Task 1: Create `HomeHeader` component

**Files:**
- Create: `frontend/app/home/components/HomeHeader.tsx`

**Steps:**
- Copy the existing header markup from `frontend/app/home/page.tsx`.
- Convert dependencies to props:
  - `activeName: string`
  - `onOpenSidePanel: () => void`
  - `onBrowseMentors: () => void`
- Keep `ThemeToggle` usage inside the component.

### Task 2: Update `/home` layout to let header stretch

**Files:**
- Modify: `frontend/app/home/page.tsx`

**Steps:**
- Move header out of the `max-w-2xl` container.
- Wrap header in a full-width container so `justify-between` pushes left/right clusters to the edges.
- Keep the existing chat layout and scrolling behavior.

### Task 3: Verify

**Steps:**
- Run: `npm test` (if configured) or `npm run lint` / `npm run build` in `frontend/`.
- Fix any TypeScript or lint issues introduced by the refactor.

