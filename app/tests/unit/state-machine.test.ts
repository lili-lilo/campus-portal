import { describe, expect, it } from "vitest";

import {
  ARTICLE_STATUSES,
  ARTICLE_TRANSITIONS,
  canTransition,
  checkExpectedStatus,
  isArticleStatus,
  publishArticle,
  reviewArticle,
  rolesForAction,
  saveArticleDraft,
  submitForReview,
  withdrawArticle,
  type ArticleStatus,
} from "@/lib/state-machine";

/**
 * 状态机单测（docs/16 §2.2）：8 条边 + 4 类非法转移 + 约束 C2（纯函数，无需数据库）
 */
describe("state-machine：8 条边（docs/13 §7.2）", () => {
  it("边 1：draft --submitForReview--> pending_first（step=submit）", () => {
    expect(submitForReview("draft")).toEqual({
      ok: true,
      from: "draft",
      to: "pending_first",
      step: "submit",
    });
  });

  it("边 2：pending_first --reviewArticle(pass)--> pending_final（step=review）", () => {
    expect(reviewArticle("pending_first", "pass")).toEqual({
      ok: true,
      from: "pending_first",
      to: "pending_final",
      step: "review",
    });
  });

  it("边 3：pending_final --publishArticle--> published（step=publish）", () => {
    expect(publishArticle("pending_final")).toEqual({
      ok: true,
      from: "pending_final",
      to: "published",
      step: "publish",
    });
  });

  it("边 4：pending_first --reviewArticle(reject)--> rejected", () => {
    expect(reviewArticle("pending_first", "reject")).toEqual({
      ok: true,
      from: "pending_first",
      to: "rejected",
      step: "reject",
    });
  });

  it("边 5：pending_final --reviewArticle(reject)--> rejected", () => {
    expect(reviewArticle("pending_final", "reject")).toEqual({
      ok: true,
      from: "pending_final",
      to: "rejected",
      step: "reject",
    });
  });

  it("边 6：published --withdrawArticle--> withdrawn", () => {
    expect(withdrawArticle("published")).toEqual({
      ok: true,
      from: "published",
      to: "withdrawn",
      step: "withdraw",
    });
  });

  it("边 7：withdrawn --submitForReview--> pending_first（撤稿后原样重提）", () => {
    expect(submitForReview("withdrawn")).toEqual({
      ok: true,
      from: "withdrawn",
      to: "pending_first",
      step: "submit",
    });
  });

  it("边 8：任意状态 --saveArticleDraft--> draft（step=submit 的回退语义）", () => {
    for (const status of ARTICLE_STATUSES) {
      const result = saveArticleDraft(status);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.to).toBe("draft");
        expect(result.step).toBe("submit");
      }
    }
  });

  it("边表恰好 8 条，且与 docs/13 §7.2 的 step 一一对应", () => {
    expect(ARTICLE_TRANSITIONS).toHaveLength(8);
    expect(ARTICLE_TRANSITIONS.map((edge) => edge.step)).toEqual([
      "submit",
      "review",
      "publish",
      "reject",
      "reject",
      "withdraw",
      "submit",
      "submit",
    ]);
  });
});

describe("state-machine：非法转移（docs/16 §2.2）", () => {
  const illegal: Array<[string, () => unknown]> = [
    ["draft → published（不能跳过两级审核）", () => publishArticle("draft")],
    ["rejected → published", () => publishArticle("rejected")],
    ["published → published（重复发布）", () => publishArticle("published")],
    ["withdrawn → published（必须经 pending_first）", () => publishArticle("withdrawn")],
    ["pending_first → published（必须先终审）", () => publishArticle("pending_first")],
    ["published --submitForReview-->", () => submitForReview("published")],
    ["rejected --submitForReview-->（必须先回 draft）", () => submitForReview("rejected")],
    ["draft --reviewArticle-->（未经提交）", () => reviewArticle("draft", "pass")],
    ["withdrawn --reviewArticle-->", () => reviewArticle("withdrawn", "reject")],
    ["draft --withdrawArticle-->", () => withdrawArticle("draft")],
  ];

  it.each(illegal)("%s 一律 INVALID_STATE_TRANSITION", (_label, run) => {
    expect(run()).toMatchObject({ ok: false, code: "INVALID_STATE_TRANSITION" });
  });
});

describe("state-machine：约束 C2（服务端比对 fromStatus）", () => {
  it("一致 → null", () => {
    expect(checkExpectedStatus("draft", "draft")).toBeNull();
  });

  it("传入过期 fromStatus → INVALID_STATE_TRANSITION（防并发双击）", () => {
    expect(checkExpectedStatus("draft", "pending_first")).toBe("INVALID_STATE_TRANSITION");
  });
});

describe("state-machine：canTransition / rolesForAction / 类型守卫", () => {
  it("canTransition 覆盖合法与非法组合", () => {
    expect(canTransition("draft", "pending_first")).toBe(true);
    expect(canTransition("pending_first", "pending_final")).toBe(true);
    expect(canTransition("pending_final", "published")).toBe(true);
    expect(canTransition("published", "withdrawn")).toBe(true);
    expect(canTransition("withdrawn", "pending_first")).toBe(true);
    expect(canTransition("rejected", "draft")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("withdrawn", "published")).toBe(false);
    // 边 8 是「任意状态 → draft」，故 pending_first → draft 也是合法的
    //（这条只能经 saveArticleDraft 达成，见下一个用例）
    expect(canTransition("pending_first", "draft")).toBe(true);
  });

  it("published → draft 只能经边 8（saveArticleDraft），不能由其它动作达成", () => {
    // docs/13 §7.2 边 8「任意状态 → draft」与 docs/16 §2.2「published → draft（不经 withdrawn）非法」
    // 的关系：前者是**保存编辑**这一动作的合法路径（规则 ④.1，改前须先落快照 C3），
    // 后者指"没有动作能直接把 published 变成 draft"以外的路径。此处两者都断言。
    expect(canTransition("published", "draft")).toBe(true);
    expect(saveArticleDraft("published")).toMatchObject({ ok: true, to: "draft" });
    expect(submitForReview("published")).toMatchObject({ ok: false });
    expect(reviewArticle("published", "pass")).toMatchObject({ ok: false });
  });

  it("rolesForAction 与 docs/13 §7.2 的「可操作角色」列一致", () => {
    expect(rolesForAction("submitForReview", "draft")).toEqual([
      "editor",
      "site_admin",
      "super_admin",
    ]);
    expect(rolesForAction("reviewArticle:pass", "pending_first")).toEqual([
      "auditor",
      "site_admin",
      "super_admin",
    ]);
    expect(rolesForAction("withdrawArticle", "published")).not.toContain("editor");
    expect(rolesForAction("publishArticle", "pending_final")).not.toContain("editor");
  });

  it("isArticleStatus 守卫", () => {
    expect(isArticleStatus("published")).toBe(true);
    expect(isArticleStatus("reviewing")).toBe(false);
    const statuses: readonly string[] = ARTICLE_STATUSES;
    expect(statuses).toHaveLength(6);
    const narrowed: ArticleStatus = "draft";
    expect(narrowed).toBe("draft");
  });
});
