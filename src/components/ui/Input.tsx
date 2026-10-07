import type { ComponentProps } from "react";

export type InputProps = ComponentProps<"input">;

/** 텍스트 입력 — Select 와 같은 높이·테두리를 씁니다 */
export function Input({ className, ...rest }: InputProps) {
  return (
    <input
      className={[
        "h-[30px] rounded-md border border-border bg-card px-2.5 text-[12px] text-text placeholder:text-text3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
