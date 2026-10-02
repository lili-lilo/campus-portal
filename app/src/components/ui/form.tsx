"use client";

/**
 * 自研 Form 组件（T1.3 Step 4）
 * ============================================================================
 * 为什么自研：shadcn 4.21.0 装不上 `form`（docs/12 §6.1 第 2 次记录），
 * 见 docs/00 §4 U-1 的裁决。
 *
 * 本地调整（相对 shadcn 官方 form.tsx）：
 *   1. `import { Slot } from "radix-ui"` —— 本项目的 shadcn 4.21 组件统一用
 *      **统一包** `radix-ui@1.6.7`（见 button.tsx / label.tsx），**不是** `@radix-ui/react-slot`。
 *      ⚠ 统一包导出的是**命名空间**，组件要写 `Slot.Root`（同 `Label.Root`、
 *      `Dialog.Root`）—— 直接写 `<Slot>` 会报 TS2604 / TS2786
 *   2. `Label` 复用本项目已有的 `@/components/ui/label`，不直接引原语
 *   3. `cn` 从 `@/lib/utils` 引（该文件即 `export { cn } from "cn"`，与既有组件同源）
 *   4. 未实现 `FormDescription`（官方实现约 9 行，超过 T1.3 给的 5 行门槛）：
 *      `useFormField` 仍按官方返回 `formDescriptionId`，`FormControl` 的
 *      `aria-describedby` 也仍引用它 —— 日后补该组件即可直接生效
 *
 * API 与 shadcn 官方一致（自 v2 稳定）：Form / FormField / FormItem / FormLabel /
 * FormControl / FormMessage / useFormField。
 */

import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Slot } from "radix-ui";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn("grid gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : props.children;

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export { useFormField, Form, FormField, FormItem, FormLabel, FormControl, FormMessage };
