import { cn } from "@/lib/utils";

/**
 * Agency Studio mark — a thin square frame holding a rotated inner square.
 * Renders in the current text color so it works on any background.
 */
export function StudioMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
      {...props}
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="9"
        y="9"
        width="6"
        height="6"
        fill="currentColor"
        transform="rotate(45 12 12)"
        opacity="0.9"
      />
    </svg>
  );
}
