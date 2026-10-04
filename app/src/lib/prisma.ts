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
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
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
