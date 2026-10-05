// ============================================================================
// Prisma Client 单例 —— Prisma 7 形态
//
// 要点（与 Prisma 6 的差别）：
//   1. 客户端**不从 `@prisma/client` 导入**，而是从 generator 的 `output` 路径导入
//      （生成于 src/generated/prisma，见 prisma/schema.prisma）
//   2. Client 构造**必须显式传入驱动适配器**（Prisma 7 起不再内置连接）
//      —— 本地与生产**统一**走 Supabase PostgreSQL：`@prisma/adapter-pg`
//      （SQLite 双轨已于 M6 Step 4b 废弃，`@prisma/adapter-better-sqlite3` 不再被引用）
//   3. 开发环境下挂到 globalThis，避免 Next.js 热重载反复创建连接
//
// 两条连接串的分工（见 .env.example / docs/11 A31）：
//   · 本文件（**运行时**）：`DATABASE_URL` = Supabase pooler 串（6543，pgbouncer）
//   · Prisma CLI（generate / db push / db seed）：`DIRECT_URL` = 直连串（5432），
//     在 prisma.config.ts 的 datasource 里读取
//
// 参考：docs/12 §4.1、docs/13 §2
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const createPrismaClient = () => {
  // 运行时走 pooler 串。缺失时给**空串**而非旧 SQLite 路径：
  // 让连接错误在首次查询时显式暴露，避免静默连到错误的库。
  // 连接池显式配置（M6 修 P1017「Server has closed the connection」）
  // ---------------------------------------------------------------------------
  // 运行时走 Supabase pooler（6543）。Supabase 免费版对**空闲连接**有服务端超时
  // （几分钟），而 pg 默认 idleTimeoutMillis = 30s ⇒ 池里的连接会"看着活着、实际已被
  // 服务端关闭"，取出来用即报 `Server has closed the connection`（P1017）。
  // 把空闲回收压到 5s（远小于服务端超时）即可让失效连接在池内被主动淘汰。
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
    max: 10, // 并发连接上限（pg 默认即 10，显式写出便于日后调优）
    idleTimeoutMillis: 5_000, // 空闲 5s 即回收（< Supabase 服务端空闲超时）
    connectionTimeoutMillis: 15_000, // 建连超时 15s（跨区首连留足余量）
  });

  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
