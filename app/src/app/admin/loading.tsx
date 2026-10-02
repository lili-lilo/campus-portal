import { Skeleton } from "@/components/ui/skeleton";

// docs/15 §6.2（U6）：后台全局加载态骨架屏（子段各自覆盖）
export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
