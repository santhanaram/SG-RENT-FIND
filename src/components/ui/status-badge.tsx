import { BadgeCheck, CircleHelp, Ban, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";

export type VerificationStatus = "verified" | "estimated" | "unverified" | "inaccessible";

const styles: Record<VerificationStatus, { label: string; className: string; Icon: typeof BadgeCheck }> = {
  verified: { label: "Verified", className: "bg-verified-soft text-verified", Icon: BadgeCheck },
  estimated: { label: "Estimated", className: "bg-estimated-soft text-estimated", Icon: Calculator },
  unverified: { label: "Unverified", className: "bg-secondary-soft text-secondary", Icon: CircleHelp },
  inaccessible: { label: "Inaccessible", className: "bg-error-soft text-error", Icon: Ban },
};

export function StatusBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const { label, className: tone, Icon } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
