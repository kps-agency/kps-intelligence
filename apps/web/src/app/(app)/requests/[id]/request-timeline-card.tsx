"use client";

import { TimelineCard } from "@/components/timeline-card";
import { useRequestTimeline } from "@/lib/queries/requests";

export function RequestTimelineCard({ requestId }: { requestId: string }) {
  return <TimelineCard timeline={useRequestTimeline(requestId)} />;
}
