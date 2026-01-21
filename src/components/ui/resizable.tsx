"use client";

import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

type PanelGroupProps = React.ComponentProps<typeof ResizablePrimitive.Panel> & {
  direction?: "horizontal" | "vertical";
};

const ResizablePanelGroup = ({ className, ...props }: PanelGroupProps) => (
  <div
    className={cn("flex h-full w-full", className)}
    data-panel-group-direction={props.direction || "horizontal"}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
}: {
  withHandle?: boolean;
  className?: string;
}) => (
  <div
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      className,
    )}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </div>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
