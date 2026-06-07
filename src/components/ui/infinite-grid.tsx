"use client";

import React, { useRef, useId } from "react";
import { cn } from "@/lib/utils";
import {
    motion,
    useMotionValue,
    useMotionTemplate,
    useAnimationFrame,
    MotionValue,
} from "framer-motion";

interface InfiniteGridProps {
    className?: string;
    children?: React.ReactNode;
}

export const InfiniteGrid = ({ className, children }: InfiniteGridProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Generate unique IDs for each grid layer to avoid SVG pattern conflicts
    const basePatternId = useId();
    const interactivePatternId = useId();

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
    };

    const gridOffsetX = useMotionValue(0);
    const gridOffsetY = useMotionValue(0);

    const speedX = 0.4;
    const speedY = 0.4;

    useAnimationFrame(() => {
        const currentX = gridOffsetX.get();
        const currentY = gridOffsetY.get();
        gridOffsetX.set((currentX + speedX) % 40);
        gridOffsetY.set((currentY + speedY) % 40);
    });

    // Radial gradient mask that follows the cursor
    const maskImage = useMotionTemplate`radial-gradient(350px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className={cn(
                "relative w-full min-h-screen flex flex-col items-center justify-start overflow-hidden bg-black",
                className
            )}
        >
            {/* Base grid layer - always visible, very subtle */}
            <div className="absolute inset-0 z-0 opacity-[0.04]">
                <GridPattern
                    patternId={basePatternId}
                    offsetX={gridOffsetX}
                    offsetY={gridOffsetY}
                />
            </div>

            {/* Interactive grid layer - visible only where cursor is */}
            <motion.div
                className="absolute inset-0 z-0 opacity-50"
                style={{
                    maskImage,
                    WebkitMaskImage: maskImage,
                }}
            >
                <GridPattern
                    patternId={interactivePatternId}
                    offsetX={gridOffsetX}
                    offsetY={gridOffsetY}
                    strokeColor="text-zinc-400"
                />
            </motion.div>

            {/* Ambient glow effects */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute right-[-10%] top-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/25 blur-[120px]" />
                <div className="absolute right-[15%] top-[5%] w-[20%] h-[20%] rounded-full bg-cyan-500/20 blur-[80px]" />
                <div className="absolute left-[-5%] bottom-[10%] w-[35%] h-[35%] rounded-full bg-blue-500/20 blur-[100px]" />
                <div className="absolute left-[20%] top-[30%] w-[25%] h-[25%] rounded-full bg-violet-600/15 blur-[100px]" />
            </div>

            {/* Content */}
            <div className="relative z-10 w-full">
                {children}
            </div>
        </div>
    );
};

interface GridPatternProps {
    patternId: string;
    offsetX: MotionValue<number>;
    offsetY: MotionValue<number>;
    strokeColor?: string;
}

const GridPattern = ({
    patternId,
    offsetX,
    offsetY,
    strokeColor = "text-zinc-500"
}: GridPatternProps) => {
    return (
        <svg className="w-full h-full">
            <defs>
                <motion.pattern
                    id={patternId}
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                    x={offsetX}
                    y={offsetY}
                >
                    <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        className={strokeColor}
                    />
                </motion.pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </svg>
    );
};

export default InfiniteGrid;
