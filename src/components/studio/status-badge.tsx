import { cn } from "@/lib/utils";
import { TONE_CLASSES, type StatusTone } from "@/shared/domain";

/**
 * Editorial status indicator: a small tone dot + label. No pill container —
 * the studio keeps status quiet.
 */
export function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: StatusTone;
  className?: string;
}) {
  const tones = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        tones.text,
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", tones.dot)}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
