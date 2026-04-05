import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[88px] w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm ring-offset-white placeholder:text-slate-400 focus-visible:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
