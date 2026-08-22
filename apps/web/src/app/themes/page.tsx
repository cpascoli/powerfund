"use client";

import { useEffect } from "react";

export default function ThemesRedirectPage() {
  useEffect(() => {
    const slug = window.location.hash.replace(/^#/, "").trim();
    const href =
      slug.length > 0
        ? `/explore?theme=${encodeURIComponent(slug)}`
        : "/explore";
    window.location.replace(href);
  }, []);

  return <p className="muted">Redirecting to Explore…</p>;
}
