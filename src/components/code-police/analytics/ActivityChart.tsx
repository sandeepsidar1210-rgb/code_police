'use client';

import { motion } from 'framer-motion';

interface ActivityChartProps {
    data: { week: string; count: number }[];
    height?: number;
    color?: string;
    showLabels?: boolean;
}

export function ActivityChart({
    data,
    height = 120,
    color = '#3b82f6',
    showLabels = true,
}: ActivityChartProps) {
    if (!data || data.length === 0) {
        return (
            <div
                className="flex items-center justify-center text-zinc-500 text-sm"
                style={{ height }}
            >
                No activity data available
            </div>
        );
    }

    const maxValue = Math.max(...data.map((d) => d.count), 1);
    const barWidth = 100 / data.length;

    return (
        <div className="w-full">
            <div className="relative" style={{ height }}>
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="border-t border-zinc-800/50" />
                    ))}
                </div>

                {/* Bars */}
                <div className="relative h-full flex items-end gap-1">
                    {data.map((item, index) => {
                        const barHeight = (item.count / maxValue) * 100;
                        return (
                            <motion.div
                                key={item.week}
                                className="flex-1 flex flex-col items-center justify-end group"
                                initial={{ opacity: 0, scaleY: 0 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                style={{ transformOrigin: 'bottom' }}
                            >
                                {/* Tooltip */}
                                <div className="hidden group-hover:block absolute -top-8 z-10 px-2 py-1 bg-zinc-800 rounded text-xs text-white whitespace-nowrap">
                                    {item.count} commits
                                </div>

                                {/* Bar */}
                                <div
                                    className="w-full rounded-t transition-all duration-200 group-hover:opacity-80"
                                    style={{
                                        height: `${Math.max(barHeight, 2)}%`,
                                        backgroundColor: color,
                                        minHeight: item.count > 0 ? '4px' : '2px',
                                    }}
                                />
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* X-axis labels */}
            {showLabels && (
                <div className="flex justify-between mt-2 text-xs text-zinc-500">
                    <span>{formatWeekLabel(data[0]?.week)}</span>
                    <span>{formatWeekLabel(data[Math.floor(data.length / 2)]?.week)}</span>
                    <span>{formatWeekLabel(data[data.length - 1]?.week)}</span>
                </div>
            )}
        </div>
    );
}

function formatWeekLabel(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface LanguageBarProps {
    languages: { name: string; percentage: number }[];
    maxVisible?: number;
}

export function LanguageBar({ languages, maxVisible = 5 }: LanguageBarProps) {
    const visible = languages.slice(0, maxVisible);
    const other = languages.slice(maxVisible);
    const otherPercentage = other.reduce((sum, l) => sum + l.percentage, 0);

    const colors = [
        '#3b82f6', // blue
        '#22c55e', // green
        '#f97316', // orange
        '#a855f7', // purple
        '#eab308', // yellow
        '#71717a', // gray (other)
    ];

    const allLanguages = otherPercentage > 0
        ? [...visible, { name: 'Other', percentage: otherPercentage }]
        : visible;

    return (
        <div className="space-y-3">
            {/* Stacked bar */}
            <div className="h-3 flex rounded-full overflow-hidden bg-zinc-800">
                {allLanguages.map((lang, index) => (
                    <motion.div
                        key={lang.name}
                        className="h-full"
                        style={{ backgroundColor: colors[index % colors.length] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${lang.percentage}%` }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
                {allLanguages.map((lang, index) => (
                    <div key={lang.name} className="flex items-center gap-2 text-sm">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: colors[index % colors.length] }}
                        />
                        <span className="text-white font-medium">{lang.name}</span>
                        <span className="text-zinc-400">{lang.percentage}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
