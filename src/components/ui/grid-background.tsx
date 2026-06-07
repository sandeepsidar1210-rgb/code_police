"use client";
import React from "react";
import { cn } from "@/lib/utils";

export const GridBackground = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "absolute inset-0 h-full w-full",
        "bg-black",
        // Grid pattern with visible lines
        "bg-[linear-gradient(to_right,#1f1f1f_1px,transparent_1px),linear-gradient(to_bottom,#1f1f1f_1px,transparent_1px)]",
        "bg-[size:4rem_4rem]",
        // Radial fade from center
        "[mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]",
        className
      )}
    >
      {/* Dot grid overlay for extra detail */}
      <div
        className={cn(
          "absolute inset-0",
          "bg-[radial-gradient(#2a2a2a_1px,transparent_1px)]",
          "bg-[size:24px_24px]",
          "opacity-50"
        )}
      />
      {/* Gradient glow at top */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-neutral-900/50 via-transparent to-transparent" />
      {children}
    </div>
  );
};
