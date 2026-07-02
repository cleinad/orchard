"use client";

import { useMemo, useState } from "react";

interface SourceFaviconProps {
  domain: string;
  title?: string;
  size?: number;
  className?: string;
}

function getInitial(domain: string, title?: string) {
  const value = title || domain;
  return value.trim().charAt(0).toUpperCase() || "?";
}

export function getSourceFaviconUrl(domain: string, size = 32) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export default function SourceFavicon({
  domain,
  title,
  size = 16,
  className = "",
}: SourceFaviconProps) {
  const [failed, setFailed] = useState(false);
  const faviconUrl = useMemo(
    () => getSourceFaviconUrl(domain, Math.max(size * 2, 32)),
    [domain, size]
  );
  const initial = getInitial(domain, title);

  if (failed || !domain) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface font-sans text-[10px] font-medium text-muted ${className}`}
        style={{ width: size, height: size }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-[4px] ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
