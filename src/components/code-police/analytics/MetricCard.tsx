'use client';

import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    color?: 'default' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple';
    size?: 'sm' | 'md' | 'lg';
}

export function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendValue,
    color = 'default',
    size = 'md',
}: MetricCardProps) {
    const colorClasses = {
        default: {
            bg: 'bg-zinc-900/50',
            border: 'border-zinc-800',
            icon: 'text-zinc-400 bg-zinc-800',
            value: 'text-white',
        },
        green: {
            bg: 'bg-emerald-500/5',
            border: 'border-emerald-500/20',
            icon: 'text-emerald-400 bg-emerald-500/10',
            value: 'text-emerald-400',
        },
        blue: {
            bg: 'bg-blue-500/5',
            border: 'border-blue-500/20',
            icon: 'text-blue-400 bg-blue-500/10',
            value: 'text-blue-400',
        },
        yellow: {
            bg: 'bg-yellow-500/5',
            border: 'border-yellow-500/20',
            icon: 'text-yellow-400 bg-yellow-500/10',
            value: 'text-yellow-400',
        },
        orange: {
            bg: 'bg-orange-500/5',
            border: 'border-orange-500/20',
            icon: 'text-orange-400 bg-orange-500/10',
            value: 'text-orange-400',
        },
        red: {
            bg: 'bg-red-500/5',
            border: 'border-red-500/20',
            icon: 'text-red-400 bg-red-500/10',
            value: 'text-red-400',
        },
        purple: {
            bg: 'bg-purple-500/5',
            border: 'border-purple-500/20',
            icon: 'text-purple-400 bg-purple-500/10',
            value: 'text-purple-400',
        },
    };

    const sizeClasses = {
        sm: { padding: 'p-3', value: 'text-xl', title: 'text-xs', icon: 'w-4 h-4 p-1' },
        md: { padding: 'p-4', value: 'text-2xl', title: 'text-sm', icon: 'w-8 h-8 p-1.5' },
        lg: { padding: 'p-5', value: 'text-3xl', title: 'text-base', icon: 'w-10 h-10 p-2' },
    };

    const colors = colorClasses[color];
    const sizes = sizeClasses[size];

    return (
        <motion.div
            className={`rounded-xl border ${colors.bg} ${colors.border} ${sizes.padding}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className={`text-zinc-400 font-medium ${sizes.title}`}>{title}</p>
                    <p className={`font-bold mt-1 ${colors.value} ${sizes.value}`}>{value}</p>
                    {subtitle && (
                        <p className="text-zinc-500 text-xs mt-1">{subtitle}</p>
                    )}
                    {trend && trendValue && (
                        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === 'up' ? 'text-green-400' :
                                trend === 'down' ? 'text-red-400' : 'text-zinc-400'
                            }`}>
                            {trend === 'up' && '↑'}
                            {trend === 'down' && '↓'}
                            {trend === 'neutral' && '→'}
                            {trendValue}
                        </div>
                    )}
                </div>
                {Icon && (
                    <div className={`rounded-lg ${colors.icon} ${sizes.icon}`}>
                        <Icon className="w-full h-full" />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

interface MetricGridProps {
    children: React.ReactNode;
    columns?: 2 | 3 | 4 | 5;
}

export function MetricGrid({ children, columns = 4 }: MetricGridProps) {
    const colClass = {
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-2 md:grid-cols-4',
        5: 'grid-cols-2 md:grid-cols-5',
    };

    return (
        <div className={`grid gap-4 ${colClass[columns]}`}>
            {children}
        </div>
    );
}
