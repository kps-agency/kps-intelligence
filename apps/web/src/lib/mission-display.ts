import { MISSION_STATUS_LABELS, TASK_STATUS_LABELS } from "@kps/shared";
import { MissionStatus, TaskStatus } from "@kps/types";
import type { BadgeProps } from "@kps/ui";

// Couleurs de badge : décisions de rendu, pas des constantes métier.
export const MISSION_STATUS_VARIANT: Record<MissionStatus, BadgeProps["variant"]> = {
  [MissionStatus.PLANNED]: "secondary",
  [MissionStatus.IN_PROGRESS]: "warning",
  [MissionStatus.BLOCKED]: "destructive",
  [MissionStatus.ON_HOLD]: "outline",
  [MissionStatus.COMPLETED]: "success",
  [MissionStatus.CANCELLED]: "outline",
};

export const TASK_STATUS_VARIANT: Record<TaskStatus, BadgeProps["variant"]> = {
  [TaskStatus.TODO]: "secondary",
  [TaskStatus.IN_PROGRESS]: "warning",
  [TaskStatus.BLOCKED]: "destructive",
  [TaskStatus.DONE]: "success",
  [TaskStatus.CANCELLED]: "outline",
};

export { MISSION_STATUS_LABELS, TASK_STATUS_LABELS };
