import { FormStatus } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

export const FORM_STATUS_VARIANT: Record<FormStatus, BadgeProps["variant"]> = {
  [FormStatus.DRAFT]: "secondary",
  [FormStatus.PUBLISHED]: "success",
  [FormStatus.ARCHIVED]: "outline",
};
