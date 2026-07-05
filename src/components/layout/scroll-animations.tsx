"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Intersection Observer that triggers maze-fade-up animations
 * when elements with [data-animate] scroll into view.
 * Re-observes on route changes and dynamically added elements.
 */
export function ScrollAnimations() {
  const pathname = usePathname();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("maze-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    function observeAll() {
      const elements = document.querySelectorAll("[data-animate]:not(.maze-visible)");
      elements.forEach((el) => observer.observe(el));
    }

    // Observe existing elements
    observeAll();

    // Watch for dynamically added [data-animate] elements
    const mutationObserver = new MutationObserver(() => {
      observeAll();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
