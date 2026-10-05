"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 页头滚动状态壳（M6 视觉改造批次 3a）—— **Client Component（客户端小岛）**
 * ============================================================================
 * 只做一件事：滚动超过 100px 时把 `data-scrolled="true"` 写到自己的容器上，
 * 由**服务端页头**用 Tailwind 的 `group-data-[scrolled=true]/hdr:*` 变体响应
 * （主栏 80px → 64px、加阴影；校徽 44 → 36）。这样页头主体仍是 Server Component。
 *
 * 容器用 `display: contents`（不产生盒子），不影响既有布局与 `sticky` 定位。
 * ⚠ `setScrolled` 只在**回调**里调用（首帧用 `requestAnimationFrame`）——
 * 规避 `react-hooks/set-state-in-effect`（同步在 effect 体内 setState）。
 */
export function HeaderScroll({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    const raf = window.requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div data-scrolled={scrolled} className="group/hdr contents">
      {children}
    </div>
  );
}
