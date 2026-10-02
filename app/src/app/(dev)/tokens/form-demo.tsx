"use client";

/**
 * 表单校验示例（T1.3 Step 4）
 * ============================================================================
 * 目的：验证自研 `@/components/ui/form`（六件套）与 **zod 4 + @hookform/resolvers@5.9.1**
 * 能跑通 —— 即 docs/12 §5 的 **R5 风险**（zod 4 破坏性变更）与 docs/16 M3 的
 * "表单校验在错误输入下给出**字段级**提示"。
 *
 * 约定：
 *   · 提交只 `console.log(values)`，**不发任何网络请求**
 *   · 三个字段各自带 FormLabel + FormControl + FormMessage
 *   · 校验消息走 zod 4 的**字符串简写参数**（`z.number("…")` / `z.email("…")`）
 *   · 年龄字段用 `valueAsNumber` 直接产出 number，避免 `z.coerce` 带来的
 *     input/output 类型分叉，从而不用给 useForm 写双泛型
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const demoSchema = z.object({
  name: z.string("请填写姓名").min(1, "请填写姓名").max(20, "姓名不超过 20 个字符"),
  email: z.email("请输入有效的邮箱地址"),
  age: z.number("请填写年龄").min(18, "年龄需满 18 岁").max(120, "年龄不合理"),
});

type DemoValues = z.infer<typeof demoSchema>;

/** 年龄默认 NaN → 输入框显示为空，提交后由 zod 报"请填写年龄" */
const DEFAULT_VALUES: DemoValues = { name: "", email: "", age: Number.NaN };

export function FormDemo() {
  const form = useForm<DemoValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: DEFAULT_VALUES,
  });

  function onSubmit(values: DemoValues) {
    console.log("[tokens/form-demo] submitted:", values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>姓名</FormLabel>
                <FormControl>
                  <Input placeholder="张三" autoComplete="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>邮箱</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="zhangsan@example.com"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>年龄</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="18"
                    {...field}
                    value={Number.isNaN(field.value) ? "" : field.value}
                    onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          规则：姓名非空且 ≤20 字；邮箱需为合法格式；年龄 18~120。错误提示由 zod 提供，经
          <code> FormMessage</code> 渲染在<strong className="text-foreground">对应字段下方</strong>
          。
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="submit">提交（仅 console.log）</Button>
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            重置
          </Button>
        </div>
      </form>
    </Form>
  );
}
