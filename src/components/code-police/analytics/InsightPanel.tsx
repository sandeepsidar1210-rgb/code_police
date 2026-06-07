'use client';

import { motion } from 'framer-motion';
import { Lightbulb, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface InsightPanelProps {
    summary: string;
    actions: string[];
    isLoading?: boolean;
    cached?: boolean;
}

export function InsightPanel({
    summary,
    actions,
    isLoading = false,
    cached = false,
}: InsightPanelProps) {
    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-6">
                    <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                        <span className="text-violet-400 font-medium">Generating AI insights...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Card */}
            <motion.div
                className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-violet-500/20 rounded-lg">
                        <Lightbulb className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-white">AI Analysis</h3>
                            {cached && (
                                <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">
                                    Cached
                                </span>
                            )}
                        </div>
                        <p className="text-zinc-300 leading-relaxed">{summary}</p>
                    </div>
                </div>
            </motion.div>

            {/* Action Items */}
            <motion.div
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
            >
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Top Actions
                </h3>
                <ul className="space-y-3">
                    {actions.map((action, index) => (
                        <motion.li
                            key={index}
                            className="flex items-start gap-3 text-zinc-300"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + index * 0.1 }}
                        >
                            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 text-sm font-medium">
                                {index + 1}
                            </span>
                            <span>{action}</span>
                        </motion.li>
                    ))}
                </ul>
            </motion.div>
        </div>
    );
}

interface ScoreBreakdownProps {
    components: {
        activity: number;
        prReview: number;
        issueResponse: number;
        documentation: number;
        busFactor: number;
        testing: number;
    };
}

export function ScoreBreakdown({ components }: ScoreBreakdownProps) {
    const items = [
        { label: 'Activity', value: components.activity, weight: '25%' },
        { label: 'PR Review', value: components.prReview, weight: '20%' },
        { label: 'Issue Response', value: components.issueResponse, weight: '15%' },
        { label: 'Documentation', value: components.documentation, weight: '15%' },
        { label: 'Bus Factor', value: components.busFactor, weight: '15%' },
        { label: 'Testing', value: components.testing, weight: '10%' },
    ];

    const getColor = (value: number) => {
        if (value >= 80) return 'bg-emerald-500';
        if (value >= 60) return 'bg-blue-500';
        if (value >= 40) return 'bg-yellow-500';
        if (value >= 20) return 'bg-orange-500';
        return 'bg-red-500';
    };

    return (
        <div className="space-y-3">
            {items.map((item, index) => (
                <motion.div
                    key={item.label}
                    className="space-y-1"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                >
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">{item.label}</span>
                        <span className="text-zinc-300 font-medium">
                            {item.value}/100 <span className="text-zinc-500">({item.weight})</span>
                        </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                            className={`h-full rounded-full ${getColor(item.value)}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${item.value}%` }}
                            transition={{ duration: 0.5, delay: index * 0.05 }}
                        />
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
