'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Shield, Presentation, Database, Coins, Zap, Users, Clock, Rocket } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/Card';
import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';

export function PricingWithChart() {
    return (
        <div className="mx-auto max-w-6xl px-4">
            {/* Heading */}
            <div className="mx-auto mb-12 max-w-2xl text-center">
                <h2 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-white">
                    Pricing that Scales with You
                </h2>
                <p className="text-zinc-400 mt-4 text-sm md:text-base">
                    Choose the right plan to unlock powerful AI tools for your startup.
                    Transparent pricing built for modern founders.
                </p>
            </div>

            {/* Pricing Grid */}
            <div className="bg-zinc-900/50 backdrop-blur-sm grid rounded-2xl border border-zinc-800 md:grid-cols-6">
                {/* Free Plan */}
                <div className="flex flex-col justify-between border-b border-zinc-800 p-6 md:col-span-2 md:border-r md:border-b-0">
                    <div className="space-y-4">
                        <div>
                            <h3 className="inline rounded-md px-2 py-1 text-xl font-semibold text-white bg-zinc-800">
                                Free
                            </h3>
                            <span className="my-3 block text-3xl font-bold text-emerald-400">
                                $0
                            </span>
                            <p className="text-zinc-500 text-sm">
                                Best for testing & understanding
                            </p>
                        </div>

                        <Button asChild variant="outline" className="w-full border-zinc-700 hover:bg-zinc-800">
                            <Link href="/sign-up">Get Started Free</Link>
                        </Button>

                        <div className="bg-zinc-800 my-6 h-px w-full" />

                        <ul className="text-zinc-400 space-y-3 text-sm">
                            {[
                                { text: '3 Code Police Analyses', icon: Shield },
                                { text: '1 Pitch Deck Generation', icon: Presentation },
                                { text: '10 Database Queries', icon: Database },
                                { text: 'Community Support', icon: Users },
                            ].map((item, index) => (
                                <li key={index} className="flex items-center gap-2">
                                    <item.icon className="h-4 w-4 text-emerald-400" />
                                    {item.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Pro Plan */}
                <div className="z-10 grid gap-8 overflow-hidden p-6 md:col-span-4 lg:grid-cols-2">
                    {/* Pricing + Chart */}
                    <div className="flex flex-col justify-between space-y-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-xl font-semibold text-white">Pro Monthly</h3>
                                <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-300 rounded-full">
                                    POPULAR
                                </span>
                            </div>
                            <span className="my-3 block text-3xl font-bold text-emerald-400">
                                $29<span className="text-lg font-normal text-zinc-500">/month</span>
                            </span>
                            <p className="text-zinc-500 text-sm">
                                Perfect for early-stage startups & solo founders
                            </p>
                        </div>
                        <div className="bg-zinc-800/50 h-fit w-full rounded-lg border border-zinc-700 p-2">
                            <InterestChart />
                        </div>
                    </div>
                    {/* Features */}
                    <div className="relative w-full">
                        <div className="text-sm font-medium text-zinc-300">Everything in Free plus:</div>
                        <ul className="text-zinc-400 mt-4 space-y-3 text-sm">
                            {[
                                { text: 'Unlimited Code Police Analyses', icon: Shield },
                                { text: 'Unlimited Pitch Deck Generations', icon: Presentation },
                                { text: 'Unlimited Database Queries', icon: Database },
                                { text: 'Equity Management Tools', icon: Coins },
                                { text: 'Priority AI Processing', icon: Zap },
                                { text: 'Team Collaboration (5 members)', icon: Users },
                                { text: 'GitHub Integration & Webhooks', icon: Clock },
                                { text: 'Auto-fix with Pull Requests', icon: Rocket },
                            ].map((item, index) => (
                                <li key={index} className="flex items-center gap-2">
                                    <item.icon className="h-4 w-4 text-emerald-400" />
                                    {item.text}
                                </li>
                            ))}
                        </ul>

                        {/* Call to Action */}
                        <div className="mt-8 grid w-full grid-cols-2 gap-2.5">
                            <Button
                                asChild
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                                <Link href="/sign-up">Get Started</Link>
                            </Button>
                            <Button asChild variant="outline" className="border-zinc-700 hover:bg-zinc-800">
                                <Link href="/sign-up">Start Free Trial</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Enterprise Banner */}
            <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h4 className="text-lg font-semibold text-white">Need Enterprise Features?</h4>
                    <p className="text-sm text-zinc-400">Custom integrations, unlimited team members, dedicated support</p>
                </div>
                <Button variant="outline" className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10">
                    <Link href="/contact">Contact Sales</Link>
                </Button>
            </div>
        </div>
    );
}

function InterestChart() {
    const chartData = [
        { month: 'Jan', users: 120 },
        { month: 'Feb', users: 180 },
        { month: 'Mar', users: 250 },
        { month: 'Apr', users: 310 },
        { month: 'May', users: 420 },
        { month: 'Jun', users: 580 },
        { month: 'Jul', users: 720 },
        { month: 'Aug', users: 890 },
        { month: 'Sep', users: 1100 },
        { month: 'Oct', users: 1350 },
        { month: 'Nov', users: 1680 },
        { month: 'Dec', users: 2100 },
    ];

    const chartConfig = {
        users: {
            label: 'Founders',
            color: '#34d399',
        },
    } satisfies ChartConfig;

    return (
        <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="space-y-0 border-b border-zinc-800 p-3">
                <CardTitle className="text-base text-white">Growing Community</CardTitle>
                <CardDescription className="text-xs text-zinc-500">
                    Founders using Protocol Zero
                </CardDescription>
            </CardHeader>
            <CardContent className="p-3">
                <ChartContainer config={chartConfig}>
                    <LineChart data={chartData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} stroke="#27272a" />
                        <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fill: '#71717a', fontSize: 10 }}
                        />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <Line
                            dataKey="users"
                            type="monotone"
                            stroke="#34d399"
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}

export default PricingWithChart;
