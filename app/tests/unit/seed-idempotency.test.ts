import { describe, expect, it } from "vitest";

/**
 * seed 幂等（docs/16 §2.5 / docs/10 §12）+ 密码哈希（docs/16 §2.5）
 *
 * ⚠ **仅在 CI 执行**（裁决 Q5）：
 *   · 本用例需要**真实 PostgreSQL**（CI 的 `postgres:16` service 容器，见 `.github/workflows/ci.yml`）；
 *     DSH / 本地开发机**没有 PG 服务** ⇒ 无法执行（M6 Step 4b 起已不再使用 SQLite）。
 *   · 因此用 `describe.skipIf(!isCI)` 守卫：本地/DSH 一律 skip，CI 执行。
 *   · 退出条款（docs/16 §6 T5）：若 CI 上 PG service 不可用 → 本用例降级为本地专用并回写文档。
 *
 * 重要实现细节：**不能**在文件顶层 `import "@/lib/prisma"` —— 那样在 DSH 下即使 skip 也会因
 * 模块顶层实例化适配器而失败；Prisma 只在用例体内动态 import。
 */

const isCI = !!process.env.CI;

const DEMO_ACCOUNTS = ["admin", "site_admin", "editor", "auditor"] as const;

async function runSeed(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("pnpm", ["db:seed"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: process.env,
    // CI 为 ubuntu-latest；Windows（本地）不会走到这里
    shell: process.platform === "win32",
  });
}

describe.skipIf(!isCI)("seed-idempotency（CI 专用：真实 PostgreSQL + 两次 db:seed）", () => {
  it("连跑两次 db:seed：各关键表行数与关键字段完全一致", async () => {
    const { execFileSync } = await import("node:child_process");
    const { prisma } = await import("@/lib/prisma");

    try {
      // 1) 建表（CI 用 postgres:16 service；无 migrations ⇒ db push 幂等）
      execFileSync("pnpm", ["prisma", "db", "push"], {
        cwd: process.cwd(),
        stdio: "pipe",
        env: process.env,
        shell: process.platform === "win32",
      });

      // 2) 第一次 seed
      await runSeed();

      const countsOf = async () => ({
        Site: await prisma.site.count(),
        Channel: await prisma.channel.count(),
        Navigation: await prisma.navigation.count(),
        Page: await prisma.page.count(),
        User: await prisma.user.count(),
        Role: await prisma.role.count(),
        Permission: await prisma.permission.count(),
        UserRole: await prisma.userRole.count(),
        Article: await prisma.article.count(),
        ArticleVersion: await prisma.articleVersion.count(),
        AuditRecord: await prisma.auditRecord.count(),
        Media: await prisma.media.count(),
        Attachment: await prisma.attachment.count(),
        Comment: await prisma.comment.count(),
        Message: await prisma.message.count(),
        Statistic: await prisma.statistic.count(),
        Form: await prisma.form.count(),
        FormData: await prisma.formData.count(),
        Config: await prisma.config.count(),
        Log: await prisma.log.count(),
      });

      const first = await countsOf();

      // 3) 第二次 seed（幂等：不应新增任何行）
      await runSeed();
      const second = await countsOf();

      expect(second).toEqual(first);

      // 4) 关键字段抽查：文章状态分布（docs/13 §6.2）
      const byStatus = await prisma.article.groupBy({ by: ["status"], _count: { _all: true } });
      const statusCounts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));
      expect(statusCounts).toEqual({
        published: 80,
        pending_first: 6,
        pending_final: 4,
        draft: 4,
        rejected: 3,
        withdrawn: 3,
      });

      // 5) 密码哈希（docs/16 §2.5）：均为 bcrypt（$2 开头）且 admin123 可校验
      const bcrypt = (await import("bcryptjs")).default;
      const passwordRows = await prisma.user.findMany({
        select: { username: true, password: true },
      });
      expect(passwordRows).toHaveLength(11);
      for (const row of passwordRows) {
        expect(row.password.startsWith("$2")).toBe(true);
      }
      for (const username of DEMO_ACCOUNTS) {
        const row = passwordRows.find((item) => item.username === username);
        expect(row).toBeDefined();
        expect(await bcrypt.compare("admin123", row?.password ?? "")).toBe(true);
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 300_000);
});
