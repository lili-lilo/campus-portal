import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChannelTree, type ChannelNode } from "@/components/admin/channel-tree";
import { auth } from "@/lib/auth";

import { listChannels, type ChannelRow } from "./actions";

export const metadata: Metadata = { title: "栏目管理" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

/** 扁平行 → 嵌套树（`parentId` 建索引，再一轮挂到父节点） */
function buildTree(rows: readonly ChannelRow[]): ChannelNode[] {
  const byId = new Map<string, ChannelNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }

  const roots: ChannelNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) {
      continue;
    }
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * 栏目管理（T3.7）—— M3 的第 5 跳「栏目树 全通」（docs/16 §4.2 M3 L297）
 *
 * · 数据源 `listChannels`（本段 `actions.ts`）：含全部 4 种 type + 含停用 + 返回 `parentId`
 * · 权限：Action 内两层（L1 `auth()` + L2 `can(role,"channel.read")`）；此处 Fail 一律 `notFound()`，
 *   不区分"未登录"与"无权限"（`editor` / `auditor` 无 `channel.read`，按规格不补权限码）
 * · 只读（裁决 Q1）：无操作按钮、无拖拽；编辑/排序属 T4.x
 */
export default async function ChannelsPage() {
  const session = await auth();
  const result = await listChannels({ siteId: session?.user.siteId ?? undefined });

  if (!result.ok) {
    notFound();
  }

  const tree = buildTree(result.data);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">栏目管理</h1>
        <p className="text-sm text-muted-foreground">
          共 {result.data.length} 个栏目（含停用；带子栏目的条目可展开/折叠）。编辑与拖拽排序属
          T4.x。
        </p>
      </div>

      <ChannelTree nodes={tree} />
    </div>
  );
}
