import { ServiceStatus } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

export const SERVICE_STATUS_VARIANT: Record<ServiceStatus, BadgeProps["variant"]> = {
  [ServiceStatus.ACTIVE]: "success",
  [ServiceStatus.INACTIVE]: "outline",
  [ServiceStatus.COMING_SOON]: "secondary",
};
