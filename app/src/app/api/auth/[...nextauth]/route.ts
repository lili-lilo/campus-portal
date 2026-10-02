// Auth.js v5 的 Route Handler —— 框架要求（docs/11 A24：保持 Route Handler）
// 路径：app/api/auth/[...nextauth]/route.ts
// 与 docs/15 §1 的路由树一致。

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
