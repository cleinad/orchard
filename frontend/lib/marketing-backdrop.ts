import type { CSSProperties } from "react";

/**
 * Shared full-viewport marketing backdrop (home, login, etc.).
 * Fixed + inline styles so dark `body` never shows through, and multi-stop gradients stay reliable.
 */
export const marketingBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  colorScheme: "light",
  // Slightly cooler base + stronger corner read better at low saturation / some colour-vision differences.
  backgroundColor: "#eef4fb",
  backgroundImage: [
    "radial-gradient(ellipse 120% 90% at 50% 0%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 55%)",
    "radial-gradient(circle at 50% 0%, rgba(124, 147, 184, 0.28) 0%, rgba(124, 147, 184, 0) 72%)",
    // Modest ellipse so it won’t flood the top-right; strong enough to read clearly.
    "radial-gradient(ellipse 78% 62% at 100% 100%, rgba(165, 192, 228, 0.82) 0%, rgba(195, 214, 238, 0.38) 46%, rgba(207, 224, 244, 0) 64%)",
    "linear-gradient(to bottom right, #ffffff 0%, #f0f6fc 58%, #dce8f4 100%)",
  ].join(", "),
};
