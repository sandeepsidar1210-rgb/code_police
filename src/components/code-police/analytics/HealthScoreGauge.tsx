'use client';

import { motion } from 'framer-motion';

interface HealthScoreGaugeProps {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    previousScore?: number;
    size?: 'sm' | 'md' | 'lg';
}

export function HealthScoreGauge({
    score,
    grade,
    previousScore,
    size = 'md',
}: HealthScoreGaugeProps) {
    const sizes = {
        sm: { container: 120, stroke: 8, fontSize: 24, gradeSize: 14 },
        md: { container: 160, stroke: 10, fontSize: 32, gradeSize: 18 },
        lg: { container: 200, stroke: 12, fontSize: 40, gradeSize: 22 },
    };

    const { container, stroke, fontSize, gradeSize } = sizes[size];
    const radius = (container - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;

    const getGradeColor = (g: string) => {
        switch (g) {
            case 'A': return { primary: '#22c55e', secondary: '#22c55e33' }; // green
            case 'B': return { primary: '#3b82f6', secondary: '#3b82f633' }; // blue
            case 'C': return { primary: '#eab308', secondary: '#eab30833' }; // yellow
            case 'D': return { primary: '#f97316', secondary: '#f9731633' }; // orange
            case 'F': return { primary: '#ef4444', secondary: '#ef444433' }; // red
            default: return { primary: '#71717a', secondary: '#71717a33' };
        }
    };

    const colors = getGradeColor(grade);
    const scoreDiff = previousScore !== undefined ? score - previousScore : 0;

    return (
        <div className="flex flex-col items-center">
            <div className="relative" style={{ width: container, height: container }}>
                <svg
                    width={container}
                    height={container}
                    className="transform -rotate-90"
                >
                    {/* Background circle */}
                    <circle
                        cx={container / 2}
                        cy={container / 2}
                        r={radius}
                        fill="none"
                        stroke={colors.secondary}
                        strokeWidth={stroke}
                    />
                    {/* Progress circle */}
                    <motion.circle
                        cx={container / 2}
                        cy={container / 2}
                        r={radius}
                        fill="none"
                        stroke={colors.primary}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - progress }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                    />
                </svg>

                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                        className="font-bold text-white"
                        style={{ fontSize }}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        {score}
                    </motion.span>
                    <span
                        className="font-semibold mt-1"
                        style={{ fontSize: gradeSize, color: colors.primary }}
                    >
                        Grade {grade}
                    </span>
                </div>
            </div>

            {/* Score change indicator */}
            {scoreDiff !== 0 && (
                <motion.div
                    className={`mt-2 flex items-center gap-1 text-sm font-medium ${scoreDiff > 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    {scoreDiff > 0 ? '↑' : '↓'} {Math.abs(scoreDiff)} from last
                </motion.div>
            )}
        </div>
    );
}
