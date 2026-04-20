"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Helper icon with shadcn tooltip (hover / focus). */
export function HelpTip({
  label,
  children,
  className,
  iconClassName,
}: {
  /** Accessible name for the trigger (matches tooltip purpose). */
  label: string;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-transparent text-[rgba(245,245,243,0.32)] transition-colors hover:text-[rgba(245,245,243,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80",
          className
        )}
        aria-label={label}
      >
        <CircleHelp className={cn("size-3.5", iconClassName)} strokeWidth={2} aria-hidden />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[min(20rem,calc(100vw-2rem))] text-left font-normal [&_p]:leading-relaxed"
      >
        <div className="space-y-2">{children}</div>
      </TooltipContent>
    </Tooltip>
  );
}
