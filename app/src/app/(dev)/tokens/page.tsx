import { A11yToggle } from "@/components/a11y-toggle";

import { FormDemo } from "./form-demo";

/**
 * T1.3 token 验证页（Server Component）
 * ============================================================================
 * URL：/tokens（`(dev)` 是路由组，只用于归类，不进 URL）
 *
 * ⚠ 这是**开发期验证页**：`docs/15-路由规格` 的 locale + `[site]` 方案落地后，
 *   根级 `/tokens` 会与 `[site]` 段冲突 → **T1.6 必须把它移除或迁入
 *   `(dev)/...` 之外的专门命名空间**（届时一并决定是删掉还是留作内部页面）。
 *
 * 本页只做两件事：① 挂无障碍开关；② 把 08 补充规格的 token 逐个渲染出来，
 * 供人眼与 150%/200% 字号下核对。不引入任何交互逻辑（逻辑都在 a11y-toggle.tsx）。
 */

/** 底色类色卡（token 名与 docs/08 补充规格 S1 一一对应） */
const SWATCHES = [
  {
    className: "bg-primary",
    token: "--primary",
    value: "#1a4f8b",
    note: "主色；对白 8.28:1（白字压其上同为 8.28:1）",
  },
  {
    className: "bg-gold",
    token: "--gold",
    value: "#c9a961",
    note: "辅色，仅点缀：对白 2.25:1 ⛔ 禁止作文本 / 图标",
  },
  {
    className: "bg-surface",
    token: "--surface",
    value: "#f5f7fa",
    note: "浅灰区块底（次级背景）",
  },
  {
    className: "bg-admin-sidebar",
    token: "--admin-sidebar",
    value: "#1f2937",
    note: "后台侧边栏底；与白字 14.68:1",
  },
] as const;

/** 文字类色样 */
const TEXT_SAMPLES = [
  {
    className: "text-foreground",
    token: "--foreground",
    value: "#1f2937",
    note: "正文；对白 14.68:1",
  },
  {
    className: "text-muted-foreground",
    token: "--muted-foreground",
    value: "#6b7280",
    note: "次级文字；对白 4.83:1（压 --surface 时恰好 4.50:1，勿再叠加透明度）",
  },
  {
    className: "text-gold-text",
    token: "--gold-text",
    value: "#8a6d1f",
    note: "需要「金色文字」时用它；对白 4.90:1（--gold 本身不可作文本）",
  },
] as const;

const RADII = [
  { className: "rounded-btn", token: "--radius-btn", value: "8px", note: "按钮 / 输入框" },
  { className: "rounded-card", token: "--radius-card", value: "12px", note: "卡片 / 弹窗" },
  { className: "rounded-image", token: "--radius-image", value: "8px", note: "图片" },
] as const;

const SHADOWS = [
  { className: "shadow-card", token: "--shadow-card", note: "卡片" },
  { className: "shadow-hover", token: "--shadow-hover", note: "悬浮" },
  { className: "shadow-modal", token: "--shadow-modal", note: "弹窗" },
] as const;

const LONG_TEXT = `学校坚持以立德树人为根本任务，围绕国家战略需求与区域经济社会发展需要，持续优化学科布局，
构建了以工为主、理工结合、多学科协调发展的办学格局。近年来，学校在人才培养、科学研究、社会服务、
文化传承创新与国际交流合作等方面取得了长足进步，先后与三十余个国家和地区的高校及科研机构建立了
稳定的合作关系，获批建设多个省部级重点实验室与工程研究中心，为学生提供了广阔的实践平台与成长空间。`;

export default function TokensDemoPage() {
  return (
    <main className="mx-auto max-w-page px-gutter py-section">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">T1.3 设计 token 验证页</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          URL <code>/tokens</code>。数值来源：
          <code>docs/08-设计规范</code> 末尾《T1.3 设计 token 补充规格（权威）》； 验收口径见{" "}
          <code>docs/00</code> §5.2。
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          检查要点：① 下面每个色样/圆角/阴影都由语义类渲染，说明 token 真的可用； ② 切到{" "}
          <strong className="text-foreground">150% / 200%</strong> 后本页
          <strong className="text-foreground">不应出现横向滚动条</strong>（容器宽用 px 锚定，间距用
          rem）。
        </p>
      </header>

      <div className="mt-8">
        <A11yToggle />
      </div>

      <section className="mt-12" aria-labelledby="tokens-colors">
        <h2 id="tokens-colors" className="text-lg font-semibold text-foreground">
          1. 色卡
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.token} className="rounded-card border border-border bg-card shadow-card">
              <div className={`${s.className} h-16 rounded-t-card`} />
              <div className="p-card pt-3">
                <p className="font-mono text-xs text-foreground">{s.token}</p>
                <p className="font-mono text-xs text-muted-foreground">{s.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{s.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-card border border-border bg-card p-card shadow-card">
          <p className="text-sm font-medium text-foreground">文字色（直接以 token 类上色）</p>
          <ul className="mt-3 space-y-3">
            {TEXT_SAMPLES.map((s) => (
              <li key={s.token}>
                <p className={`${s.className} text-base`}>中文示例文字 Aa Bb 0123 —— {s.token}</p>
                <p className="text-xs text-muted-foreground">
                  {s.value}　{s.note}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tokens-radius">
        <h2 id="tokens-radius" className="text-lg font-semibold text-foreground">
          2. 圆角
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {RADII.map((r) => (
            <div
              key={r.token}
              className="rounded-card border border-border bg-card p-card shadow-card"
            >
              <div className={`${r.className} h-20 border border-border bg-surface`} />
              <p className="mt-3 font-mono text-xs text-foreground">{r.token}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {r.value}　{r.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tokens-shadow">
        <h2 id="tokens-shadow" className="text-lg font-semibold text-foreground">
          3. 阴影
        </h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          {SHADOWS.map((s) => (
            <div key={s.token} className={`${s.className} rounded-card bg-card p-card`}>
              <p className="font-mono text-xs text-foreground">{s.token}</p>
              <p className="text-xs text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tokens-type">
        <h2 id="tokens-type" className="text-lg font-semibold text-foreground">
          4. 中文长文本（验字体与缩放）
        </h2>
        <div className="mt-4 rounded-card border border-border bg-card p-card shadow-card">
          <p className="text-base leading-body text-foreground">{LONG_TEXT}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            字体栈：拉丁 <code>Geist</code> → <code>PingFang SC</code> →<code>Microsoft YaHei</code>{" "}
            → <code>Noto Sans SC</code> → 系统回落； 正文行高 <code>1.75</code>（
            <code>leading-body</code>）。
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            间距 token：<code>max-w-page</code>（1280px，px 锚定）、
            <code>px-gutter</code>（24px）、<code>py-section</code>（80px）、
            <code>p-card</code>（24px）。
          </p>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tokens-form">
        <h2 id="tokens-form" className="text-lg font-semibold text-foreground">
          5. 表单校验示例
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          自研 <code>@/components/ui/form</code>（T1.3 Step 4 / U-1）+ zod 4 +
          <code> @hookform/resolvers@5.9.1</code>。提交只打印到控制台，不发请求；
          空提交或填错可看到字段级提示（对应 <code>docs/16</code> M3 的验收口径）。
        </p>
        <div className="mt-4 rounded-card border border-border bg-card p-card shadow-card">
          <FormDemo />
        </div>
      </section>
    </main>
  );
}
