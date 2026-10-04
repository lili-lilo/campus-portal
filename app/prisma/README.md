# 本目录由 T1.1 创建，用于存放 Prisma schema、迁移与种子脚本。
#
# 各文件的创建时点与责任人（均为 T1.x 任务）：
#   schema.prisma    → T1.4（24 个 model，内容见 docs/13-数据模型-v2.md §2）
#   seed.ts          → T1.5（幂等 upsert，映射见 docs/10-种子数据说明.md §6）
#   migrations/      → M6 Step 4b 起**不存在**：本地/生产统一 Supabase PostgreSQL，
#                      建表改用 `pnpm db:push`（原 SQLite 迁移已随双轨一并删除）
#
# 注意：本文件（README.md）不是 Prisma 的必需文件，仅用于说明目录用途。
