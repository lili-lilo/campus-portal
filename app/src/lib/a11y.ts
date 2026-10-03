/**
 * 无障碍偏好的唯一事实来源（**M5-2a：cookie 持久化版**；T1.3 原为 localStorage + 内联脚本）
 * ============================================================================
 * 三段衔接（**不要合并**）：
 *   ① **SSR**：根 `app/layout.tsx` 用 `next/headers` 的 `cookies()` 读偏好，
 *      经本模块的 `parseA11yPreferences()` 解析后**直接把档位写在 `<html>` 的
 *      `data-a11y-font` / `data-a11y-contrast` 上** ⇒ 首帧即正确，**无闪烁**
 *   ② **客户端切换**：`set()` = 写 cookie + 写 `<html>` 属性 + 广播（三件事一次做完）
 *   ③ **hydration 后**：`useSyncExternalStore` 接管，`getSnapshot()` 以 **`<html>` 属性**
 *      为快照来源（单一事实来源：服务端与 `set()` 都写它）
 *
 * 为什么不再用内联脚本（M5-2a 用户裁决）：
 *   · 旧方案（T1.3 `<script dangerouslySetInnerHTML>` → T2.3 改 `next/script`
 *     `beforeInteractive`）始终会渲染一个 `<script>`，React 19 报
 *     「Encountered a script tag while rendering React component」（`docs/00` §8 #51）
 *   · 改为"服务端读 cookie 后写 SSR 属性"后，**不再需要任何脚本**，警告根治
 *   · 代价：cookie **不触发 `storage` 事件** ⇒ 跨标签页实时同步已放弃（裁决 ③，见 `subscribe`）
 *
 * 持久化载体：**cookie**，键名沿用旧 localStorage 键（`a11y-font-scale` / `a11y-contrast`）
 *   · 旧 localStorage 值**不迁移**（裁决 ②：作品集场景，重新选一次即可）
 *   · 属性名权威：`docs/16-测试与验收规格.md` §2.1 第 5 步（`data-a11y-font` / `data-a11y-contrast`）
 *   · 变量选择器在 `globals.css`（`html[data-a11y-font="…"]` / `html[data-a11y-contrast="on"]`），
 *     本模块**不动 CSS**
 *
 * ⚠ 本模块同时被 Server Component（根 layout）与 Client Component 引用：
 *   · **模块顶层不得触碰 window / document**（浏览器访问一律封装在函数体内）
 *   · **不得 import `next/headers`**（客户端组件引用本模块会构建失败）⇒
 *     读 cookie 的 IO 留在 layout，本模块只提供**纯函数** `parseA11yPreferences()`
 */

/** cookie 名（定死，不得改名；与旧 localStorage 键同名） */
export const A11Y_FONT_KEY = "a11y-font-scale";
export const A11Y_CONTRAST_KEY = "a11y-contrast";

/** cookie 有效期：1 年（秒） */
export const A11Y_COOKIE_MAX_AGE = 31_536_000;

/** 同标签页广播事件名（cookie 不触发 `storage` 事件，故只保留同标签页广播） */
export const A11Y_CHANGE_EVENT = "a11y-change";

/** 字号缩放 5 档，覆盖 100%~200%（08 补充规格 S5） */
export const FONT_SCALES = ["100", "125", "150", "175", "200"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const CONTRAST_STATES = ["on", "off"] as const;
export type ContrastState = (typeof CONTRAST_STATES)[number];

/** 默认值：SSR 无 cookie（或 cookie 非法）时写进 `<html>` 的档位 */
export const DEFAULT_FONT_SCALE: FontScale = "100";
export const DEFAULT_CONTRAST: ContrastState = "off";

/** `<html>` 上的属性名 */
export const FONT_SCALE_ATTR = "data-a11y-font";
export const CONTRAST_ATTR = "data-a11y-contrast";

/** 解析结果（根 layout 直接写到 `<html>`） */
export type A11yPreferences = {
  font: FontScale;
  contrast: ContrastState;
};

/**
 * 解析 cookie 值 → 无障碍偏好（**纯函数、零 IO**，供根 layout 使用）。
 *
 * 为什么入参是"两个可选字符串"而不是 `cookies()` 的 store 对象：
 * 本模块会被**客户端组件**引用，若在此 import `next/headers` 会直接构建失败 ⇒
 * 把 IO（`await cookies()`）留在 layout，本函数只做校验与回落。
 */
export function parseA11yPreferences(raw: {
  fontScale?: string;
  contrast?: string;
}): A11yPreferences {
  return {
    font: isAllowed<FontScale>(raw.fontScale, FONT_SCALES) ? raw.fontScale : DEFAULT_FONT_SCALE,
    contrast: isAllowed<ContrastState>(raw.contrast, CONTRAST_STATES)
      ? raw.contrast
      : DEFAULT_CONTRAST,
  };
}

/**
 * 每个 key 一组 store 读写接口（供 useSyncExternalStore 直接用）。
 * - `getSnapshot`：读 **`<html>` 属性**（服务端已按 cookie 渲染、`set()` 也同步写它）
 *   → 返回**原始字符串**（返回新对象会让 useSyncExternalStore 每次比较都不相等 → 无限渲染）
 * - `subscribe`：只监听同标签页的 `A11Y_CHANGE_EVENT`；**不再监听 `storage`**
 *   （cookie 不触发该事件 ⇒ 跨标签页实时同步已放弃，见模块头注释）
 * - `getServerSnapshot`：SSR 与 hydration 首帧用的默认值（真实档位由 `<html>` 属性承载）
 */
export type A11yStore<T extends string> = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
};

function isAllowed<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function createStringStore<T extends string>(config: {
  /** cookie 名 */
  key: string;
  /** `<html>` 属性名 */
  attribute: string;
  allowed: readonly T[];
  serverValue: T;
}): { store: A11yStore<T>; set: (value: T) => void } {
  const { key, attribute, allowed, serverValue } = config;

  function getSnapshot(): T {
    try {
      const raw = document.documentElement.getAttribute(attribute);
      return isAllowed<T>(raw, allowed) ? raw : serverValue;
    } catch {
      /* document 不可用（理论上不会发生）：退回默认值 */
      return serverValue;
    }
  }

  function subscribe(onStoreChange: () => void): () => void {
    window.addEventListener(A11Y_CHANGE_EVENT, onStoreChange);
    return () => {
      window.removeEventListener(A11Y_CHANGE_EVENT, onStoreChange);
    };
  }

  /** setter：三件事一次做完 —— 写 cookie + 写 `<html>` 属性 + 广播 */
  function set(value: T): void {
    try {
      // 只写必要属性：path 保证全站可见、max-age 保证持久化、samesite=lax 防 CSRF 语义。
      // **不硬写 `Secure`**：本地 http dev 下会导致 cookie 写不进去。
      document.cookie = `${key}=${value}; path=/; max-age=${A11Y_COOKIE_MAX_AGE}; samesite=lax`;
    } catch {
      /* cookie 不可用（隐私模式 / 被禁用）：放弃持久化，本次切换仍然生效 */
    }
    document.documentElement.setAttribute(attribute, value);
    window.dispatchEvent(new Event(A11Y_CHANGE_EVENT));
  }

  return { store: { subscribe, getSnapshot, getServerSnapshot: () => serverValue }, set };
}

const fontScale = createStringStore<FontScale>({
  key: A11Y_FONT_KEY,
  attribute: FONT_SCALE_ATTR,
  allowed: FONT_SCALES,
  serverValue: DEFAULT_FONT_SCALE,
});

const contrast = createStringStore<ContrastState>({
  key: A11Y_CONTRAST_KEY,
  attribute: CONTRAST_ATTR,
  allowed: CONTRAST_STATES,
  serverValue: DEFAULT_CONTRAST,
});

/** 字号缩放：三个接口一组 */
export const fontScaleStore: A11yStore<FontScale> = fontScale.store;

/** 高对比度：三个接口一组 */
export const contrastStore: A11yStore<ContrastState> = contrast.store;

/** 字号缩放：写 cookie + 写属性 + 广播（三件事一次做完） */
export const setFontScale = fontScale.set;

/** 高对比度：写 cookie + 写属性 + 广播（三件事一次做完） */
export const setContrast = contrast.set;

/**
 * 只把两个属性写回 `<html>`（不碰 cookie、不广播）——**幂等同步**。
 *
 * 为什么保留：服务端已按 cookie 渲染正确属性，但
 *   · dev 下 React Strict Mode 会重挂载一次，可能把 `<html>` 重置为 JSX 里的值；
 *   · 将来若 `<html>` 的 JSX 初值发生变化，本函数保证"store 快照 = DOM 属性"这一不变量。
 * 调用方应传 **store 的当前快照**（`getSnapshot()`），而不是 hydration 首帧的
 * `useSyncExternalStore` 返回值，避免把服务端渲染的档位覆盖回默认值。
 */
export function applyA11yAttributes(fontScaleValue: FontScale, contrastValue: ContrastState): void {
  const root = document.documentElement;
  root.setAttribute(FONT_SCALE_ATTR, fontScaleValue);
  root.setAttribute(CONTRAST_ATTR, contrastValue);
}
