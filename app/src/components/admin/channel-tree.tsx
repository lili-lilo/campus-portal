import type { ChannelRow } from "@/app/admin/channels/actions";

/**
 * 栏目树（T3.7）—— **Server Component**
 * ============================================================================
 * · 渲染：`<ul>/<li>` 递归；**非叶子节点**用 `<details>/<summary>` 折叠 —— 与 T2.6 的
 *   `/sitemap` 站点地图同款（`(site)/[locale]/[site]/sitemap/page.tsx` L24 原文：
 *   「交互：`<details>/<summary>` **折叠**，**零 JS、键盘可达**（无 `'use client'`）」）
 * · 只读（T3.7 裁决 Q1）：无操作按钮、无拖拽；字段显示 name / **nameEn** / slug / type / status
 *   （`nameEn` 列由 **M5-1 / `docs/00` §8 #58** 追加：前台英文站取它，后台在此可比对是否缺失；空值显示「—」）
 * · `type` 中文映射为**本文件常量**（Q6，与后台"硬编码中文"口径一致）；未知 type 显示原值
 * · 站点名仅在**结果跨站点**时附加（`super_admin` 的 `siteId` 为 null → 会拿到 4 个站点的栏目）
 */

export type ChannelNode = ChannelRow & { children: ChannelNode[] };

/** type 中文名（schema.prisma L65 的 4 个取值） */
const TYPE_LABELS = new Map<string, string>([
  ["list", "列表"],
  ["page", "单页"],
  ["link", "外链"],
  ["form", "表单"],
]);

function typeLabel(type: string): string {
  return TYPE_LABELS.get(type) ?? type;
}

/** 启用 / 停用小标签（内联 `span`，样式对齐 T3.3 `StatusBadge` 的 token 口径，不走 `ui/badge.tsx`） */
function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        enabled
          ? "rounded-full border border-primary/40 px-1.5 py-0.5 text-xs text-primary"
          : "rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
      }
    >
      {enabled ? "启用" : "停用"}
    </span>
  );
}

function ChannelMeta({ node, showSiteName }: { node: ChannelNode; showSiteName: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      <span className="font-medium">{node.name}</span>
      <span className="text-xs text-muted-foreground">英文名（nameEn）：{node.nameEn ?? "—"}</span>
      <code className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
        {node.slug}
      </code>
      <span className="text-xs text-muted-foreground">{typeLabel(node.type)}</span>
      <StatusPill enabled={node.status} />
      {showSiteName ? (
        <span className="text-xs text-muted-foreground">· {node.siteName}</span>
      ) : null}
    </span>
  );
}

function ChannelTreeItem({ node, showSiteName }: { node: ChannelNode; showSiteName: boolean }) {
  if (node.children.length === 0) {
    return (
      <li className="rounded-md px-3 py-1.5 hover:bg-muted/60">
        <ChannelMeta node={node} showSiteName={showSiteName} />
      </li>
    );
  }

  return (
    <li>
      <details>
        <summary className="cursor-pointer rounded-md px-3 py-1.5 hover:bg-muted">
          <ChannelMeta node={node} showSiteName={showSiteName} />
        </summary>

        <ul className="mt-1 ml-4 space-y-1 border-l border-border/60 pl-3">
          {node.children.map((child) => (
            <ChannelTreeItem key={child.id} node={child} showSiteName={showSiteName} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** 收集树里出现过的站点名（用于判断是否需要显示站点后缀） */
function collectSiteNames(nodes: readonly ChannelNode[]): Set<string> {
  const names = new Set<string>();
  const walk = (list: readonly ChannelNode[]) => {
    for (const node of list) {
      names.add(node.siteName);
      walk(node.children);
    }
  };
  walk(nodes);
  return names;
}

export function ChannelTree({ nodes }: { nodes: readonly ChannelNode[] }) {
  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无栏目。</p>;
  }

  const showSiteName = collectSiteNames(nodes).size > 1;

  return (
    <ul className="space-y-1 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10">
      {nodes.map((node) => (
        <ChannelTreeItem key={node.id} node={node} showSiteName={showSiteName} />
      ))}
    </ul>
  );
}
