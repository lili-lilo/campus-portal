// ============================================================================
// Prisma Client 单例 —— Prisma 7 形态
//
// 要点（与 Prisma 6 的差别）：
//   1. 客户端**不从 `@prisma/client` 导入**，而是从 generator 的 `output` 路径导入
//      （生成于 src/generated/prisma，见 prisma/schema.prisma）
//   2. Client 构造**必须显式传入驱动适配器**（Prisma 7 起不再内置连接）
//      - 开发：@prisma/adapter-better-sqlite3
//      - 生产：@prisma/adapter-pg（T1.4/第 6 周切换，见 docs/11 A31）
//   3. 开发环境下挂到 globalThis，避免 Next.js 热重载反复创建连接
//
// 参考：docs/12 §4.1、docs/13 §2
// ============================================================================

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";

const createPrismaClient = () => {
  // 连接串从 .env 读取（DATABASE_URL="file:./prisma/dev.db"）。
  // `file:` 相对路径由 Prisma 按 prisma.config.ts 所在目录（本项目为 app/）解析 → app/prisma/dev.db
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
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
