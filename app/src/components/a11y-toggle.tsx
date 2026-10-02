"use client";

/**
 * 无障碍开关（T1.3 Step 3）
 * ============================================================================
 * 两个控件：字号缩放 5 档（100/125/150/175/200）+ 高对比度开关。
 *
 * 状态来源：`useSyncExternalStore`（T1.3 裁决 B —— 撤回原先「不用 useSyncExternalStore」那句）
 *   · getServerSnapshot 返回 '100' / 'off' → SSR 与 hydration 首帧一致，无 hydration mismatch
 *   · hydration 后由 store 接管；用户操作走 store 的 setter（写 localStorage + 写属性 + 广播）
 *   · 两个 snapshot 都是原始字符串，不做对象包装（对象每次都是新引用 → 无限渲染）
 *
 * 唯一残留的 effect **不写 React state**，只把 store 的当前快照写回 <html>：
 *   Next 16 随包指南 preventing-flash-before-hydration.md §"Re-applying attributes
 *   in development" 说明 —— dev 下 React Strict Mode 会重挂载一次并把 <html>
 *   重置为 JSX 里的值，内联脚本写入的档位会丢；这个 effect 负责恢复。
 *   注意它读的是 **store 快照**而不是 React 状态：hydration 首帧的状态仍是
 *   server snapshot（'100'/'off'），拿它回写会把内联脚本刚写入的档位覆盖回默认值，
 *   反而制造一次闪烁。
 */

import { useEffect, useSyncExternalStore } from "react";

import {
  applyA11yAttributes,
  CONTRAST_STATES,
  contrastStore,
  FONT_SCALES,
  fontScaleStore,
  setContrast,
  setFontScale,
  type ContrastState,
  type FontScale,
} from "@/lib/a11y";

const FONT_LABELS: Record<FontScale, string> = {
  "100": "100%",
  "125": "125%",
  "150": "150%",
  "175": "175%",
  "200": "200%",
};

const CONTRAST_LABELS: Record<ContrastState, string> = {
  on: "已开启",
  off: "已关闭",
};

/** 与 shadcn 控件一致的焦点环写法（颜色来自 --ring，不新造样式） */
const CONTROL_BASE =
  "rounded-btn border px-3 py-1.5 text-sm transition-colors duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const CONTROL_ON = "border-primary bg-primary text-primary-foreground";
const CONTROL_OFF = "border-border bg-card text-foreground hover:bg-surface";

export function A11yToggle() {
  const fontScale = useSyncExternalStore(
    fontScaleStore.subscribe,
    fontScaleStore.getSnapshot,
    fontScaleStore.getServerSnapshot,
  );
  const contrast = useSyncExternalStore(
    contrastStore.subscribe,
    contrastStore.getSnapshot,
    contrastStore.getServerSnapshot,
  );

  useEffect(() => {
    // 只写 DOM、不 setState（符合 react-hooks/set-state-in-effect）。
    // 直接读 store 快照 → 不会用 hydration 首帧的 server snapshot 覆盖内联脚本的写入。
    applyA11yAttributes(fontScaleStore.getSnapshot(), contrastStore.getSnapshot());
  }, []);

  return (
    <section
      aria-labelledby="a11y-toggle-title"
      className="rounded-card border border-border bg-card p-card shadow-card"
    >
      <h2 id="a11y-toggle-title" className="text-lg font-semibold text-foreground">
        无障碍开关
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        设置写入 localStorage，刷新后保持。属性加在 <code>&lt;html&gt;</code> 上：
        <code> data-a11y-font</code> / <code>data-a11y-contrast</code>。
      </p>

      <div className="mt-6">
        <span id="a11y-font-label" className="text-sm font-medium text-foreground">
          字号缩放
        </span>
        <div role="group" aria-labelledby="a11y-font-label" className="mt-2 flex flex-wrap gap-2">
          {FONT_SCALES.map((scale) => {
            const active = scale === fontScale;
            return (
              <button
                key={scale}
                type="button"
                aria-pressed={active}
                onClick={() => setFontScale(scale)}
                className={`${CONTROL_BASE} ${active ? CONTROL_ON : CONTROL_OFF}`}
              >
                {FONT_LABELS[scale]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <span id="a11y-contrast-label" className="text-sm font-medium text-foreground">
          高对比度
        </span>
        <div className="mt-2" role="group" aria-labelledby="a11y-contrast-label">
          <button
            type="button"
            aria-pressed={contrast === "on"}
            onClick={() => setContrast(contrast === "on" ? "off" : "on")}
            className={`${CONTROL_BASE} ${contrast === "on" ? CONTROL_ON : CONTROL_OFF}`}
          >
            高对比度：{CONTRAST_LABELS[contrast]}
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        当前状态：字号 <strong className="text-foreground">{FONT_LABELS[fontScale]}</strong>
        ，对比度 <strong className="text-foreground">{CONTRAST_LABELS[contrast]}</strong>
        （可选值 {CONTRAST_STATES.join(" / ")}）。
      </p>
    </section>
  );
}
