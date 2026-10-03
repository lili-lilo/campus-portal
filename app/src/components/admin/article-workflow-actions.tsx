"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  publishArticle,
  reviewArticle,
  submitForReview,
  withdrawArticle,
} from "@/app/admin/articles/actions";
import { Button } from "@/components/ui/button";
import { ROLE_CODES, type Role } from "@/lib/permissions";
import {
  isArticleStatus,
  rolesForAction,
  type ArticleStatus,
  type TransitionAction,
} from "@/lib/state-machine";

/**
 * 审核流操作区（T4.1b）—— **本轮唯一的新客户端组件**
 * ============================================================================
 * · 按「当前状态 + 当前角色」渲染按钮，**规则不另写一份**：直接问 `lib/state-machine.ts` 的
 *   `rolesForAction(action, from)`（docs/13 §7.2 的「可操作角色」列）
 * · `editor` 另需 `isOwner`（C4：`data.own_only`），由服务端传入 `createdById === session.user.id`
 * · 调 Action 时**都带 `fromStatus: status`**，激活服务端 C2 乐观并发校验
 * · 失败 → 顶部 `p[role="alert"]`；成功 → `router.refresh()`（徽标与时间线一起刷新）
 * · 状态 → 按钮（`rejected` 无按钮：用「保存草稿」回 `draft`，边 8）
 */

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转，同 `actions.ts` 的 `isRole`） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

type WorkflowResult = { ok: boolean; message?: string };

type WorkflowItem = {
  key: string;
  label: string;
  variant?: "default" | "outline" | "destructive";
  /** 二次确认文案（「退回」「撤稿」等不可逆感强的操作用） */
  confirm?: string;
  run: () => Promise<WorkflowResult>;
};

export function ArticleWorkflowActions({
  articleId,
  status,
  role,
  isOwner,
}: {
  articleId: string;
  status: string;
  role: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isArticleStatus(status) || !isRole(role)) {
    return null;
  }

  const from: ArticleStatus = status;
  const fromStatus = from;

  /** 该动作在当前状态下对本角色是否可用（边的角色白名单 + editor 的 C4 本人限制） */
  const allowed = (action: TransitionAction) =>
    rolesForAction(action, from).includes(role) && (role !== "editor" || isOwner);

  const items: WorkflowItem[] = [];

  if (from === "draft" && allowed("submitForReview")) {
    items.push({
      key: "submit",
      label: "提交初审",
      run: () => submitForReview({ id: articleId, fromStatus }),
    });
  }

  if (from === "pending_first" && allowed("reviewArticle:pass")) {
    items.push({
      key: "pass",
      label: "初审通过",
      run: () => reviewArticle({ id: articleId, action: "pass", fromStatus }),
    });
  }

  if (from === "pending_final" && allowed("publishArticle")) {
    items.push({
      key: "publish",
      label: "发布",
      run: () => publishArticle({ id: articleId, fromStatus }),
    });
  }

  // 边 4 / 5：两个待审状态都能"退回"（docs/13 §7.2；`step` 相同、`fromStatus` 不同）
  if ((from === "pending_first" || from === "pending_final") && allowed("reviewArticle:reject")) {
    items.push({
      key: "reject",
      label: "退回",
      variant: "outline",
      confirm: "确认退回？稿件将变为「已退回」，需修改后重新提交。",
      run: () => reviewArticle({ id: articleId, action: "reject", fromStatus }),
    });
  }

  if (from === "published" && allowed("withdrawArticle")) {
    items.push({
      key: "withdraw",
      label: "撤稿",
      variant: "destructive",
      confirm: "确认撤稿？撤稿后前台立即不可见，且需重走两级审核才能再次发布。",
      run: () => withdrawArticle({ id: articleId, fromStatus }),
    });
  }

  if (from === "withdrawn" && allowed("submitForReview")) {
    items.push({
      key: "resubmit",
      label: "重新提交初审",
      run: () => submitForReview({ id: articleId, fromStatus }),
    });
  }

  // `rejected` 刻意无按钮：唯一出口是「保存草稿」回 draft（边 8，docs/13 §7.3 规则①）

  async function handleClick(item: WorkflowItem) {
    if (item.confirm && !window.confirm(item.confirm)) {
      return;
    }

    setError(null);
    setPendingKey(item.key);

    try {
      const result = await item.run();

      if (!result.ok) {
        setError(result.message ?? "操作失败，请重试。");
        return;
      }

      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className={ALERT_CLASS}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={item.variant ?? "default"}
            disabled={pendingKey !== null}
            onClick={() => void handleClick(item)}
          >
            {pendingKey === item.key ? "处理中…" : item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
