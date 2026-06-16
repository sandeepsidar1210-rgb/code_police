"use client";

import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  GitBranch,
  Key,
  Search,
  Zap,
  CheckCircle,
  Github,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: GitBranch,
    title: "Dependency Graph",
    description:
      "See exactly what a PR affects before merging. Understand the blast-radius of every change across your entire dependency tree.",
    color: "text-cyan-400",
    gradient: "from-cyan-500/10 to-transparent",
    glow: "group-hover:shadow-cyan-500/10",
  },
  {
    icon: Zap,
    title: "Self-Healing PRs",
    description:
      "Let AI automatically fix bugs, security vulnerabilities, and code quality issues before they reach production.",
    color: "text-emerald-400",
    gradient: "from-emerald-500/10 to-transparent",
    glow: "group-hover:shadow-emerald-500/10",
  },
  {
    icon: Key,
    title: "BYOK Support",
    description:
      "Bring Your Own Key support makes Code-Police fully sustainable for OSS communities with enterprise-grade security.",
    color: "text-violet-400",
    gradient: "from-violet-500/10 to-transparent",
    glow: "group-hover:shadow-violet-500/10",
  },
];

const steps = [
  {
    number: "01",
    title: "Connect Repository",
    description:
      "Link your GitHub repository with one click. Code-Police instantly syncs your PRs and codebase.",
    icon: Github,
  },
  {
    number: "02",
    title: "AI Review Engine",
    description:
      "Every PR is analyzed for security, performance, and code quality. Our AI understands your entire codebase.",
    icon: Search,
  },
  {
    number: "03",
    title: "Auto-Fix & Merge",
    description:
      "Get automated fix PRs, dependency insights, and merge confidence scores. Review and merge with peace of mind.",
    icon: CheckCircle,
  },
];

const stats = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "10K+", label: "PRs Reviewed" },
  { value: "5min", label: "Avg. Review Time" },
  { value: "97%", label: "Developer Satisfaction" },
];

export default function LandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-violet-500/30 selection:text-white overflow-x-hidden">
      <Header />

      <main>
        {/* ===== HERO ===== */}
        <section className="relative pt-32 pb-20 px-4 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-violet-500/10 rounded-full blur-[120px]" />
            <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[80px]" />
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
          </div>

          <div className="max-w-5xl mx-auto relative z-10">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-300 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                AI-Powered Code Review for Open Source
              </div>

              <h1 className="text-5xl md:text-7xl font-heading font-bold tracking-tight leading-tight">
                <span className="text-white">Your Code,</span>
                <br />
                <span className="bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                  Automatically Policed
                </span>
              </h1>

              <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
                Self-healing code & an AI co-maintainer for open source.
                Automated PR review, dependency blast-radius graphs, and
                merge-conflict pre-checks — all in one platform.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <Link
                  href={isSignedIn ? "/dashboard" : "/sign-up"}
                  className="group relative inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  Get Started Free
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="https://github.com"
                  target="_blank"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-neutral-800 bg-neutral-900/50 text-neutral-300 font-medium text-sm hover:bg-neutral-800 hover:text-white transition-all duration-300"
                >
                  <Github className="w-4 h-4" />
                  View on GitHub
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===== STATS ===== */}
        <section className="py-12 px-4 border-y border-neutral-800/50">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl md:text-4xl font-heading font-bold bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-sm text-neutral-500 mt-1">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section className="py-24 px-4" id="features">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl md:text-5xl font-heading font-bold tracking-tight">
                Everything you need to{" "}
                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  ship with confidence
                </span>
              </h2>
              <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
                From automated reviews to self-healing PRs, Code-Police gives
                OSS maintainers superpowers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className={cn(
                    "group relative p-8 rounded-2xl border border-neutral-800 bg-neutral-900/40",
                    "hover:border-neutral-700 transition-all duration-500",
                    "hover:shadow-xl",
                    feature.glow
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b",
                      feature.gradient
                    )}
                  />
                  <div className="relative z-10">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center mb-5 border border-neutral-700/50 bg-neutral-800/50",
                        "group-hover:scale-110 transition-transform duration-300"
                      )}
                    >
                      <feature.icon className={cn("w-6 h-6", feature.color)} />
                    </div>
                    <h3 className="text-lg font-heading font-semibold text-white mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section className="py-24 px-4 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[100px]" />
          </div>

          <div className="max-w-5xl mx-auto relative z-10">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl md:text-5xl font-heading font-bold tracking-tight text-white">
                How it{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  works
                </span>
              </h2>
              <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
                Three simple steps to automate your code review workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <div key={step.number} className="relative">
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-12 left-[60%] w-[40%] h-px bg-gradient-to-r from-violet-500/40 to-transparent" />
                  )}
                  <div className="flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full border border-neutral-800 bg-neutral-900/60 flex items-center justify-center mb-6">
                      <step.icon className="w-8 h-8 text-violet-400" />
                    </div>
                    <span className="text-sm font-mono text-violet-400 mb-2">
                      {step.number}
                    </span>
                    <h3 className="text-lg font-heading font-semibold text-white mb-3">
                      {step.title}
                    </h3>
                    <p className="text-sm text-neutral-400 leading-relaxed max-w-xs">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-neutral-900 to-cyan-500/10 p-12 md:p-16 text-center overflow-hidden">
              <div className="absolute -top-40 -left-40 w-80 h-80 bg-violet-500/20 rounded-full blur-[100px]" />
              <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-cyan-500/20 rounded-full blur-[100px]" />

              <div className="relative z-10 space-y-6">
                <h2 className="text-3xl md:text-5xl font-heading font-bold tracking-tight text-white">
                  Ready to ship safer code?
                </h2>
                <p className="text-neutral-400 text-lg max-w-lg mx-auto">
                  Join thousands of OSS maintainers who trust Code-Police to
                  keep their codebases healthy.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href={isSignedIn ? "/dashboard" : "/sign-up"}
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-neutral-950 font-semibold text-sm hover:bg-neutral-200 transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                  >
                    Get Started Free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-neutral-700 text-neutral-300 font-medium text-sm hover:bg-neutral-800 hover:text-white transition-all duration-300"
                  >
                    Talk to Sales
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
