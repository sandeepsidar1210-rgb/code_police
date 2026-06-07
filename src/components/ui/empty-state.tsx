"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Ghost } from "lucide-react";

interface EmptyStateProps {
    title?: string;
    description?: string;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
}

export function EmptyState({
    title = "Nothing here yet",
    description = "Get started by creating something new",
    actionLabel = "Get started",
    actionHref,
    onAction,
}: EmptyStateProps) {
    return (
        <AnimatePresence mode="wait">
            <motion.div
                className="flex flex-col items-center justify-center py-16 px-4 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                {/* Ghost Icon */}
                <motion.div
                    className="mb-6"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    <motion.div
                        className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <Ghost className="w-8 h-8 text-zinc-500" />
                    </motion.div>
                </motion.div>

                {/* Title */}
                <motion.h3
                    className="text-lg font-medium text-zinc-300 mb-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
                >
                    {title}
                </motion.h3>

                {/* Description */}
                <motion.p
                    className="text-sm text-zinc-500 mb-6 max-w-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
                >
                    {description}
                </motion.p>

                {/* Action Button */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
                >
                    {actionHref ? (
                        <Link
                            href={actionHref}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-zinc-900 bg-zinc-100 rounded-lg hover:bg-white transition-colors"
                        >
                            {actionLabel}
                        </Link>
                    ) : onAction ? (
                        <button
                            onClick={onAction}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-zinc-900 bg-zinc-100 rounded-lg hover:bg-white transition-colors"
                        >
                            {actionLabel}
                        </button>
                    ) : null}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
