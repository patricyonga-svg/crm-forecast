import { STAGE_COLOR, STAGE_LABEL, type Stage } from "@/lib/domain";

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[stage]}`}>{STAGE_LABEL[stage]}</span>;
}
