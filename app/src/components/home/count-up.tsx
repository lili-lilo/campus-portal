"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

/**
 * 滚动数字计数（M6 视觉改造批次 2）—— **Client Component（客户端小岛）**
 * ============================================================================
 * · 进入视口（`once: true`）后从 0 计数到 `value`；`prefers-reduced-motion: reduce` 时**直接显示终值**
 * · 数值渲染走 `MotionValue`（`useTransform` + `motion.span` 子节点），**不使用 React state**
 *   —— 既避免每帧 re-render，也规避 `react-hooks/set-state-in-effect`
 * · SSR/首帧渲染 "0"（与客户端首帧一致，无水合不一致）；`+` 后缀由 `suffix` 传入
 */
type CountUpProps = {
  value: number;
  /** 数字后缀（如 "+"） */
  suffix?: string;
  className?: string;
};

export function CountUp({ value, suffix = "", className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const text = useTransform(count, (v) => `${Math.floor(v).toLocaleString("en-US")}${suffix}`);

  useEffect(() => {
    // 降级：直接落到终值（`MotionValue.set` 不是 setState，不受 effect 内同步更新限制）
    if (reduce) {
      count.set(value);
      return;
    }
    if (!inView) {
      return;
    }
    const controls = animate(count, value, { duration: 1.2, ease: "easeOut" });
    return () => controls.stop();
  }, [count, inView, reduce, value]);

  return (
    <span ref={ref} className={className}>
      <motion.span>{text}</motion.span>
    </span>
  );
}
