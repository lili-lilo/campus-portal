"use client";

/**
 * 无障碍开关（T1.3 Step 3；M5-2b 起接 i18n）
 * ============================================================================
 * 两个控件：字号缩放 5 档（100/125/150/175/200）+ 高对比度开关。
 *
 * 状态来源：`useSyncExternalStore`（T1.3 裁决 B —— 撤回原先「不用 useSyncExternalStore」那句）
 *   · `getServerSnapshot` 返回 '100' / 'off' → SSR 与 hydration 首帧一致，无 hydration mismatch
 *   · hydration 后由 store 接管；用户操作走 store 的 setter（**写 cookie** + 写属性 + 广播，M5-2a 起）
 *   · 两个 snapshot 都是原始字符串，不做对象包装（对象每次都是新引用 → 无限渲染）
 *
 * 唯一残留的 effect **不写 React state**，只把 store 的当前快照写回 <html>（幂等同步，
 * 防御 dev Strict Mode 的重挂载；见 `@/lib/a11y` 的同名函数注释）。
 *
 * i18n（M5-2b）：文案走 `useTranslations("accessibility")` —— 本组件是 **Client Component**，
 *   messages 由 `(site)/[locale]/layout.tsx` 的 `NextIntlClientProvider` 下发。
 *   ⚠ 因此本组件**只能挂在 `[locale]` 之内**（真实入口：`site-footer.tsx` 的 `<details>`）；
 *   `/tokens`（`[locale]` 之外）已于 M5-2a 移除本组件。
 */

import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

import {
  applyA11yAttributes,
  contrastStore,
  FONT_SCALES,
  fontScaleStore,
  setContrast,
  setFontScale,
  type FontScale,
} from "@/lib/a11y";

const FONT_LABELS: Record<FontScale, string> = {
  "100": "100%",
  "125": "125%",
  "150": "150%",
  "175": "175%",
  "200": "200%",
};

/** 与 shadcn 控件一致的焦点环写法（颜色来自 --ring，不新造样式） */
const CONTROL_BASE =
  "rounded-btn border px-3 py-1.5 text-sm transition-colors duration-200 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const CONTROL_ON = "border-primary bg-primary text-primary-foreground";
const CONTROL_OFF = "border-border bg-card text-foreground hover:bg-surface";

export function A11yToggle() {
  // M5-2b：文案走 i18n（本组件是 Client Component，provider 在 (site)/[locale]/layout.tsx）
  const t = useTranslations("accessibility");
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
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.rich("storedHint", { code: (chunks) => <code>{chunks}</code> })}
      </p>

      <div className="mt-6">
        <span id="a11y-font-label" className="text-sm font-medium text-foreground">
          {t("fontScale")}
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
          {t("contrast")}
        </span>
        <div className="mt-2" role="group" aria-labelledby="a11y-contrast-label">
          <button
            type="button"
            aria-pressed={contrast === "on"}
            onClick={() => setContrast(contrast === "on" ? "off" : "on")}
            className={`${CONTROL_BASE} ${contrast === "on" ? CONTROL_ON : CONTROL_OFF}`}
          >
            {/* 按钮文案只用 on/off（组标签已在上一行，避免把中文冒号硬编码进 JSX） */}
            {t(contrast)}
          </button>
        </div>
      </div>

      {/* M5-2b：加 aria-live ⇒ 切换后读屏播报当前档位（A36「ARIA 补齐」） */}
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {t("currentState", {
          font: FONT_LABELS[fontScale],
          contrast: t(contrast),
        })}
      </p>
    </section>
  );
}
