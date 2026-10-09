"use client";

// Fades a section in the first time it scrolls into view (landing page sections).
// Safe by default: the section is visible in the HTML and stays visible unless we are sure the
// effect can run — the page is on screen, the section starts below the fold, and the browser can
// watch scrolling. Only then is it hidden until it comes into view (CSS: [data-reveal] in
// globals.css; never hidden when the user prefers reduced motion).

import { useEffect, useRef } from "react";

export default function Reveal({ children, className = "", id }: {
  children: React.ReactNode; className?: string; id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (document.visibilityState !== "visible" || window.innerHeight === 0) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already on screen: no effect

    const show = () => { el.dataset.reveal = "shown"; cleanup(); };
    const onScroll = () => { if (el.getBoundingClientRect().top < window.innerHeight * 0.92) show(); };
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) show(); },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    function cleanup() {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeprint", show);
    }
    el.dataset.reveal = "hidden";
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true }); // backup if the observer is slow
    window.addEventListener("beforeprint", show);
    return () => { cleanup(); el.dataset.reveal = "shown"; };
  }, []);

  return <div ref={ref} id={id} className={className}>{children}</div>;
}
