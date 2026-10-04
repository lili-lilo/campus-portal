/**
 * prisma.config.ts —— Prisma 7 配置文件
 * ============================================================================
 * 本文件于 T1.1（H2）落盘，2026-10-02 修正 `datasource.url` 的类型用法：
 *   - `import "dotenv/config"`：**保留**（Prisma 7 刻意不加载 .env，实测其 loader 传 dotenv:false）
 *   - `datasource.url`：改为官方 `env("DATABASE_URL")`（**静态 string**，非函数式）
 *   - `migrations.seed`：指向 prisma/seed.ts（T1.5 实现）
 *
 * 一、本文件与 schema.prisma 的分工
 * ----------------------------------------------------------------------------
 *   prisma/schema.prisma   →  只描述「数据长什么样」
 *                            - generator：怎么生成客户端
 *                            - datasource：用哪种数据库（provider）
 *                            - model / enum：表、字段、关系、索引
 *
 *   prisma.config.ts       →  只描述「怎么连、怎么跑」（本文件）
 *                            - 连接串（url）与影子库（shadowDatabaseUrl）
 *                            - migrations 目录、seed 入口
 *                            - CLI 使用哪份 schema
 *
 *   两者都必须存在，缺一不可：
 *     - schema 里**不再写** url / directUrl / shadowDatabaseUrl（Prisma 7 已废弃这些字段）
 *     - config 里**不定义**任何 model；它不做数据建模
 *
 * 二、相对 Prisma 6 的变化（本项目最容易照旧文档写错的地方）
 * ----------------------------------------------------------------------------
 *   Prisma 6 及以前：连接串写在 schema.prisma 的 datasource 块里
 *       datasource db {
 *         provider  = "sqlite"
 *         url       = env("DATABASE_URL")
 *         directUrl = env("DIRECT_URL")        // 迁移用直连
 *       }
 *
 *   Prisma 7：上述字段全部迁到本文件；schema 里只保留 provider。
 *     并且 —— url 字段现在由 **CLI** 使用（即迁移用直连），
 *     运行时 Client 的连接由驱动适配器负责（见 src/lib/prisma.ts 单例）。
 *
 * 三、与驱动适配器的关系
 * ----------------------------------------------------------------------------
 *   本文件只管 CLI 侧（generate / migrate / db seed）。
 *   应用运行时（Next.js 进程）**不使用**本文件，而是：
 *   本地与生产**统一**走 Supabase PostgreSQL（方案 A，M6 Step 4b）：
 *     - 运行时：`@prisma/adapter-pg` + `DATABASE_URL`（Supabase pooler 连接串，见 src/lib/prisma.ts）
 *   原因：Prisma 7 起，Client 构造必须显式传入驱动适配器。
 *
 * 四、.env 的加载方式（已定：方案 A）
 * ----------------------------------------------------------------------------
 *   Next.js 自身的 .env 加载**不覆盖** Prisma CLI 进程，
 *   所以直接运行 `pnpm db:push` / `pnpm db:seed` 时不会自动读到 .env。
 *   故显式引入 dotenv（已作为 devDependency 安装）。
 * ============================================================================
 */

// .env 加载（方案 A）。**必须保留** —— 实测 Prisma 7 加载 config 文件时传入
// `dotenv: false`（@prisma/config@7.10.0 dist/index.js L633-634，注释原文
// "do not load .env files"），即 Prisma 7 **刻意不自动加载 .env**。
// 因此由本行负责把 .env 注入 process.env，下面的 env() 才能读到。
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  /**
   * 数据库连接 —— 供 **Prisma CLI** 使用（generate / migrate / db seed / studio）。
   *
   * ⚠ 类型要点（实测 @prisma/config@7.10.0 的 dist/index.d.ts）：
   *     export declare type Datasource = { url?: string; shadowDatabaseUrl?: string };
   *     export declare function env(name: string): string;
   *   即 `url` 是 **静态 string**，**不是函数**。
   *   （T1.1 曾误写为 `url: () => process.env.DATABASE_URL` —— 函数不满足 string，
   *     且 process.env.X 的类型是 string | undefined，会在 migrate 时报
   *     "The datasource.url property is required in your Prisma config file"。）
   *
   * 使用官方 `env()` 辅助函数：它返回 `process.env[name]`，缺失时**抛错**
   * （@prisma/config dist/index.js L515-521：if (!value) throw new PrismaConfigEnvError(name)），
   * 属 fail-fast，优于静默 undefined。
   *
   * 环境变量取值（见 app/.env.example；方案 A：本地与生产共用 Supabase PG）：
   *   DIRECT_URL   ： Supabase **直连/session** 串（端口 5432）—— **本文件（Prisma CLI）使用**
   *                  —— 因为 pooler 不支持迁移/推送所需的会话级操作（见 docs/11 A31）
   *   DATABASE_URL ： pooler 串（端口 6543）—— 运行时 Client 使用，见 src/lib/prisma.ts
   */
  datasource: {
    // CLI（generate / db push / db seed 的首次连接）走直连串。
    // 运行时 Client 的连接由 src/lib/prisma.ts 的 pg 适配器用 DATABASE_URL 负责。
    // 原因：Supabase pooler 不支持会话级操作（见 docs/11 A31）。
    url: env("DIRECT_URL"),
  },

  /**
   * 迁移与 seed 配置。
   */
  migrations: {
    /** 迁移记录目录（相对项目根 app/）。使用默认值时此项可省略，此处显式写出便于阅读。 */
    path: "prisma/migrations",

    /**
     * seed 入口。
     *
     * ⚠ Prisma 7 把 seed 命令从 package.json 的 `prisma.seed` 字段**迁到了本文件**，
     *   `prisma db seed` 读取的是这里，而不是 package.json。
     *
     * 用 tsx 执行 TS 脚本（tsx 已装为 devDependency）。
     * 脚本文件 prisma/seed.ts 尚未创建 —— 由 **T1.5** 实现；
     * 在那之前执行 `pnpm db:seed` 会报「文件不存在」，属预期。
     */
    seed: "tsx prisma/seed.ts",
  },

  /**
   * CLI 默认使用的 schema 文件位置（与 config 的分工见文件头第一节）。
   * 使用默认路径 prisma/schema.prisma 时可省略；schema 文件由 **T1.4** 创建。
   */
  // schema: "prisma/schema.prisma",
});

/* ============================================================================
 * schema.prisma 在 Prisma 7 下的形态（对照用；实际文件由 T1.4 创建）
 * 完整 schema 见 docs/13-数据模型-v2.md §2（24 个 model）
 * ----------------------------------------------------------------------------
 * generator client {
 *   provider = "prisma-client"           // 注意：不是 prisma-client-js
 *   output   = "../src/generated/prisma" // 必填，客户端从该路径导入
 * }
 *
 * datasource db {
 *   provider = "sqlite"                  // 生产改 "postgresql"
 *   // 此处不再写 url / directUrl / shadowDatabaseUrl —— 已迁至本文件
 * }
 * ========================================================================= */
