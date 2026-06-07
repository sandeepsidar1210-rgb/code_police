"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface GhostfounderLoaderProps {
    size?: "sm" | "md" | "lg";
    text?: string;
    className?: string;
}

const sizeConfig = {
    sm: { image: 40, text: "text-xs" },
    md: { image: 64, text: "text-sm" },
    lg: { image: 96, text: "text-base" },
};

/**
 * ProtocolZeroLoader - Branded loading component with floating ghost animation
 * Used across all loading states for consistent branding
 */
export function GhostfounderLoader({
    size = "md",
    text,
    className = "",
}: GhostfounderLoaderProps) {
    const config = sizeConfig[size];

    return (
        <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
            {/* Floating Ghost Animation */}
            <motion.div
                animate={{
                    y: [0, -12, 0],
                }}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="relative"
            >
                {/* Subtle glow effect */}
                <div
                    className="absolute inset-0 blur-xl opacity-30"
                    style={{
                        background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
                    }}
                />

                {/* Ghost Image */}
                <motion.div
                    animate={{
                        opacity: [0.7, 1, 0.7],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                >
                    <Image
                        src="/zero3.png"
                        alt="Loading..."
                        width={config.image}
                        height={config.image}
                        className="relative z-10 drop-shadow-lg"
                        priority
                    />
                </motion.div>
            </motion.div>

            {/* Loading Text */}
            {text && (
                <motion.p
                    animate={{
                        opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    className={`${config.text} text-zinc-400 font-medium`}
                >
                    {text}
                </motion.p>
            )}
        </div>
    );
}

export default GhostfounderLoader;
