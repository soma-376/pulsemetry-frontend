import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "default" | "primary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  // 기본 — 카드 배경 + 테두리
  default: "border border-border bg-card text-text hover:bg-hover",
  // 주요 동작 — 원본은 파랑이 아니라 텍스트 색을 채웁니다
  primary:
    "border border-[var(--text)] bg-[var(--text)] text-[var(--card)] font-semibold hover:no-underline",
  danger: "border border-red/40 bg-red-tint text-red font-semibold hover:bg-red/15",
  ghost: "border-0 bg-transparent text-text2 hover:bg-hover",
};

const SIZE: Record<Size, string> = {
  sm: "h-[26px] px-2.5 text-[11.5px]",
  md: "h-[30px] px-2.5 text-[12px]",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium cursor-pointer transition-colors disabled:cursor-default disabled:opacity-55";

function classes(variant: Variant, size: Size, className?: string) {
  return [BASE, VARIANT[variant], SIZE[size], className]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={classes(variant, size, className)} {...rest} />
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
};

/** 같은 생김새의 링크 — 내비게이션이면 button 이 아니라 a 여야 합니다 */
export function ButtonLink({
  variant = "default",
  size = "md",
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={classes(variant, size, className)} {...rest} />;
}
