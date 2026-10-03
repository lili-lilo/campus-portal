import { Skeleton } from "@/components/ui/skeleton";

/**
 * 回收站加载态（`docs/15` L337「每段一个 loading.tsx」）
 * —— 与其它后台段同款：骨架屏占位，不做 spinner
 */
export default function RecycleLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-4 w-64" />

      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
