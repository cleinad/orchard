/**
 * Rounded rectangle with a narrow leading column — the usual “sidebar / panel” affordance
 * (same glyph for open and close so the control reads as one toggle).
 */
export default function SidebarPanelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      {/* Outer panel border — half-pixel offset keeps strokes crisp at 20px render size */}
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="2.5" />
      {/* Sidebar column divider */}
      <path d="M9 3v18" />
    </svg>
  );
}
