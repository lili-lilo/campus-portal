/**
 * 无障碍偏好的唯一事实来源（T1.3 Step 3 · useSyncExternalStore 版）
 * ============================================================================
 * 三段衔接（**不要合并**）：
 *   ① SSR：layout.tsx 的 <html data-a11y-font="100" data-a11y-contrast="off">
 *   ② 首帧前：A11Y_INIT_SCRIPT 内联脚本读 localStorage 并改写这两个属性（防 FOUC）
 *   ③ hydration 后：本模块的 store 接口 + useSyncExternalStore 接管
 *
 * 与 globals.css 的约定：变量选择器 html[data-a11y-font="…"] /
 * html[data-a11y-contrast="on"] 由 Step 2 落盘（08 补充规格 S4/S5），本步不动 CSS。
 *
 * 属性名权威：docs/16-测试与验收规格.md 第 95 行（data-a11y-font / data-a11y-contrast）
 * 存储键名由 T1.3 硬约束定死，不得改名。
 *
 * ⚠ 本模块同时被 Server Component（layout.tsx）与 Client Component 引用，
 *   因此**模块顶层不得触碰 window / localStorage / document**，
 *   所有浏览器访问一律封装在函数体内。
 */

/** localStorage 键（定死，不得改名） */
export const A11Y_FONT_KEY = "a11y-font-scale";
export const A11Y_CONTRAST_KEY = "a11y-contrast";

/** 同标签页广播事件名 —— 'storage' 事件不会在触发它的那个标签页里派发 */
export const A11Y_CHANGE_EVENT = "a11y-change";

/** 字号缩放 5 档，覆盖 100%~200%（08 补充规格 S5） */
export const FONT_SCALES = ["100", "125", "150", "175", "200"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const CONTRAST_STATES = ["on", "off"] as const;
export type ContrastState = (typeof CONTRAST_STATES)[number];

/** SSR 默认值：必须与 layout.tsx 中 <html> 上的初始属性一致 */
export const DEFAULT_FONT_SCALE: FontScale = "100";
export const DEFAULT_CONTRAST: ContrastState = "off";

/** <html> 上的属性名 */
export const FONT_SCALE_ATTR = "data-a11y-font";
export const CONTRAST_ATTR = "data-a11y-contrast";

/**
 * 每个 key 一组 store 读写接口（供 useSyncExternalStore 直接用）。
 * - `subscribe`：监听 'storage'（跨标签页）+ 'a11y-change'（同标签页）
 * - `getSnapshot`：返回**原始字符串**。返回新对象会让 useSyncExternalStore 每次比较都不相等 → 无限渲染
 * - `getServerSnapshot`：SSR 与 hydration 首帧用的默认值
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
  key: string;
  attribute: string;
  allowed: readonly T[];
  serverValue: T;
}): { store: A11yStore<T>; set: (value: T) => void } {
  const { key, attribute, allowed, serverValue } = config;

  function getSnapshot(): T {
    try {
      const raw = localStorage.getItem(key);
      return isAllowed<T>(raw, allowed) ? raw : serverValue;
    } catch {
      /* localStorage 不可用（隐私模式）：退回默认值 */
      return serverValue;
    }
  }

  function subscribe(onStoreChange: () => void): () => void {
    const handleLocalChange = () => onStoreChange();
    const handleStorage = (event: StorageEvent) => {
      /* key === null 表示对方调用了 localStorage.clear() → 任何 key 都要重读 */
      if (event.key === null || event.key === key) onStoreChange();
    };
    window.addEventListener(A11Y_CHANGE_EVENT, handleLocalChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(A11Y_CHANGE_EVENT, handleLocalChange);
      window.removeEventListener("storage", handleStorage);
    };
  }

  /** setter：三件事一次做完 —— 写 localStorage + 写 <html> 属性 + 广播 */
  function set(value: T): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 隐私模式 / 配额满：放弃持久化，本次切换仍然生效 */
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

/** 字号缩放：写 localStorage + 写属性 + 广播（三件事一次做完） */
export const setFontScale = fontScale.set;

/** 高对比度：写 localStorage + 写属性 + 广播（三件事一次做完） */
export const setContrast = contrast.set;

/**
 * 只把两个属性写回 <html>（不碰 localStorage、不广播）。
 *
 * 为什么需要它：Next 16 随包指南 `preventing-flash-before-hydration.md` 的
 * §"Re-applying attributes in development" 指出 —— 生产构建只需内联脚本，
 * 但 **dev 下 React Strict Mode 会重挂载一次，并把 <html> 重置为 JSX 里写的值**，
 * 内联脚本写入的档位会被冲掉。故客户端组件挂载后用它恢复。
 *
 * 注意：调用方必须传入 **store 的当前快照**，不要传 hydration 首帧的
 * useSyncExternalStore 返回值 —— 后者在首帧仍是 server snapshot（'100'/'off'），
 * 会把内联脚本刚写入的档位覆盖回默认值，反而制造闪烁。
 */
export function applyA11yAttributes(fontScaleValue: FontScale, contrastValue: ContrastState): void {
  const root = document.documentElement;
  root.setAttribute(FONT_SCALE_ATTR, fontScaleValue);
  root.setAttribute(CONTRAST_ATTR, contrastValue);
}

/**
 * 防 FOUC 内联脚本（由 layout.tsx 注入 <head>，本步保持不变）
 * ----------------------------------------------------------------------------
 * 依据：Next 16 随包指南 `node_modules/next/dist/docs/01-app/02-guides/`
 *       `preventing-flash-before-hydration.md` 的 Themes 一节 ——
 *       同样的 IIFE + try/catch 结构，脚本在 <head> 中同步执行，早于首次绘制。
 * 要点：
 *   · 单行，避免内联脚本里出现换行导致的意外
 *   · 值非法（手改 localStorage）时落回 SSR 默认值，与 <html> 初始属性一致
 *   · 键名与取值由本模块常量生成，避免与 FONT_SCALES / DEFAULT_* 漂移
 *   · ⚠ 若日后启用严格 CSP，本内联脚本需要 nonce（见该指南的 CSP 说明）
 */
export const A11Y_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var f=localStorage.getItem(${JSON.stringify(
  A11Y_FONT_KEY,
)});d.setAttribute(${JSON.stringify(FONT_SCALE_ATTR)},${JSON.stringify(FONT_SCALES)}.indexOf(f)>-1?f:${JSON.stringify(
  DEFAULT_FONT_SCALE,
)});var c=localStorage.getItem(${JSON.stringify(
  A11Y_CONTRAST_KEY,
)});d.setAttribute(${JSON.stringify(CONTRAST_ATTR)},${JSON.stringify(CONTRAST_STATES)}.indexOf(c)>-1?c:${JSON.stringify(
  DEFAULT_CONTRAST,
)})}catch(e){}})();`;
