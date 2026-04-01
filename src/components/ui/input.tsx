import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            "flex h-12 w-full rounded-xl border border-primary/20 bg-white px-4 py-2 text-base text-foreground shadow-sm placeholder:text-muted-foreground transition-all",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-error focus:ring-error/50",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-error">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
