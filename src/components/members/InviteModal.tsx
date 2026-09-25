"use client";

import type { ComponentProps } from "react";
import { InviteForm } from "./InviteForm";

export function InviteModal(props: Omit<ComponentProps<typeof InviteForm>, "inline">) {
  return <InviteForm {...props} />;
}
