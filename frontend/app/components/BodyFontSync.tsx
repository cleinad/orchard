"use client";

import { useLayoutEffect } from "react";
import {
  BODY_FONT_STORAGE_KEY,
  applyBodyFont,
  resolveBodyFontId,
} from "@/lib/body-font";

/** Re-apply after hydration (bootstrap may be overwritten) and when another tab changes storage. */
export default function BodyFontSync() {
  useLayoutEffect(() => {
    const applyStored = (raw: string | null) =>
      applyBodyFont(resolveBodyFontId(raw));
    applyStored(window.localStorage.getItem(BODY_FONT_STORAGE_KEY));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== BODY_FONT_STORAGE_KEY) return;
      applyStored(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
