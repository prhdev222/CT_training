import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-11 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm ring-offset-white transition-shadow file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
