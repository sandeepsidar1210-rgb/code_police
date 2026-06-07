"use client";

import * as React from "react";
import { useState, Suspense, lazy } from "react";
import { Spotlight } from "@/components/ui/spotlight";

// Lazy load Spline to avoid blocking page
const Spline = lazy(() => import("@splinetool/react-spline"));

interface TypewriterProps {
    text: string | string[];
    speed?: number;
    cursor?: string;
    className?: string;
}

function Typewriter({
    text,
    speed = 80,
    cursor = "|",
    className,
}: TypewriterProps) {
    const [displayText, setDisplayText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const textArray = Array.isArray(text) ? text : [text];
    const currentText = textArray[0] || "";

    React.useEffect(() => {
        if (!currentText || currentIndex >= currentText.length) return;

        const timeout = setTimeout(() => {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
        }, speed);

        return () => clearTimeout(timeout);
    }, [currentIndex, currentText, speed]);

    return (
        <span className={className}>
            {displayText}
            <span className="animate-pulse">{cursor}</span>
        </span>
    );
}

interface AuthLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle: string;
    quote?: string;
}

export function AuthLayout({ children, title, subtitle, quote }: AuthLayoutProps) {
    const [sceneLoaded, setSceneLoaded] = useState(false);

    return (
        <div className="w-full min-h-screen grid md:grid-cols-2 bg-neutral-950">
            {/* Left side - Auth form */}
            <div className="flex items-center justify-center p-8">
                <div className="w-full max-w-sm">
                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
                        <p className="text-sm text-zinc-500 mt-2">{subtitle}</p>
                    </div>
                    {children}
                </div>
            </div>

            {/* Right side - 3D Scene */}
            <div className="hidden md:block relative bg-zinc-900/50 overflow-hidden">
                <Spotlight className="-top-40 left-0 md:left-20 md:-top-20" fill="white" />

                {/* 3D Scene */}
                <div className="absolute inset-0">
                    <Suspense
                        fallback={
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                                    <span className="text-sm text-zinc-500">Loading 3D scene...</span>
                                </div>
                            </div>
                        }
                    >
                        <Spline
                            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                            className="w-full h-full"
                            onLoad={() => setSceneLoaded(true)}
                        />
                    </Suspense>
                </div>

                {/* Bottom quote overlay */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-neutral-950 to-transparent" />
                <div className="absolute bottom-8 left-0 right-0 px-8 z-10">
                    <blockquote className="text-center">
                        <p className="text-base text-zinc-300 font-medium">
                            &ldquo;
                            <Typewriter
                                text={quote || "Build something extraordinary."}
                                speed={50}
                            />
                            &rdquo;
                        </p>
                        <cite className="block text-xs text-zinc-600 mt-2 not-italic">
                            — Protocol Zero
                        </cite>
                    </blockquote>
                </div>
            </div>
        </div>
    );
}

export { Typewriter };
