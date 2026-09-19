import type { ComponentProps } from "react";

export type SelectProps = ComponentProps<"select">;

export function Select({ className, ...rest }: SelectProps) {
  return (
    <select
      className={[
        "h-[30px] cursor-pointer rounded-md border border-border bg-card px-1.5 text-[12px] text-text",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
