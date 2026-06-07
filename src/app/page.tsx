"use client";

import Link from "next/link";
import { Header } from "@/components/layout";
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export default function LandingPage() {
  const [typedText, setTypedText] = useState("");
  const fullText = "$ code-police --watch your-repo";
  const { isSignedIn } = useAuth();

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0e0f] text-[#c9d1d9] font-mono selection:bg-[#3fb950] selection:text-black">
      <Header />

      <main className="flex flex-col items-center justify-center min-h-[80vh] px-4 pt-20">
        <div className="max-w-3xl w-full flex flex-col gap-8">
          {/* Main Hero Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-2">
              <span className="text-[#56d364]">Code-</span>Police
            </h1>
            <p className="text-[#6e7681] text-lg md:text-xl max-w-2xl mx-auto">
              Self-healing code & an AI co-maintainer for open source.
              Automated PR review, dependency blast-radius graphs, and merge-conflict pre-checks.
            </p>
          </div>

          {/* Terminal Window Demo */}
          <div className="term-window mt-8 mx-auto w-full shadow-2xl">
            <div className="term-titlebar">
              <div className="flex gap-2">
                <span className="term-dot term-dot-red" />
                <span className="term-dot term-dot-amber" />
                <span className="term-dot term-dot-green" />
              </div>
              <span className="mx-auto flex items-center gap-2">
                ~/projects/opensource <span className="text-[#6e7681]">— zsh</span>
              </span>
            </div>
            
            <div className="p-6 text-sm md:text-base leading-relaxed term-scanlines bg-[#0f1418]">
              <div className="mb-4">
                <span className="term-prompt" />
                <span>{typedText}</span>
                <span className="term-cursor" />
              </div>
              
              {typedText === fullText && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                  <div className="text-[#56d364] mb-2">✓ Initialized watch mode for repository</div>
                  <div className="text-[#39c5cf] mb-2">ℹ Detected new Pull Request #42</div>
                  <div className="text-[#6e7681] mb-2">  Analyzing dependency blast-radius...</div>
                  <div className="text-[#6e7681] mb-2">  Checking for merge conflicts...</div>
                  <div className="text-[#6e7681] mb-4">  Generating AI review comments...</div>
                  
                  <div className="border border-[#1c2528] rounded-md p-4 bg-[#11161a]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="term-chip term-chip-high">High Impact</span>
                      <span className="text-white font-semibold">PR #42 Analysis Complete</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[#c9d1d9]">
                      <li><span className="text-[#ff5f56]">3 files changed</span>, <span className="text-[#ffbd2e]">12 files transitively affected</span></li>
                      <li><span className="text-[#27c93f]">0</span> merge conflicts detected</li>
                      <li>Generated <span className="text-[#58a6ff]">2</span> code fix suggestions</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              href={isSignedIn ? "/dashboard" : "/sign-up"}
              className="px-8 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-medium rounded-md transition-colors w-full sm:w-auto text-center"
            >
              Get Started
            </Link>
            <Link
              href="https://github.com"
              target="_blank"
              className="px-8 py-3 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] font-medium rounded-md transition-colors w-full sm:w-auto text-center flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              View on GitHub
            </Link>
          </div>
          
          {/* Features grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 pb-16">
            <div className="p-6 border border-[#1c2528] rounded-xl bg-[#0f1418]">
              <h3 className="text-[#58a6ff] font-semibold mb-2">Dependency Graph</h3>
              <p className="text-sm text-[#8b949e]">See exactly what a PR affects before merging. Understand the blast-radius of every change.</p>
            </div>
            <div className="p-6 border border-[#1c2528] rounded-xl bg-[#0f1418]">
              <h3 className="text-[#56d364] font-semibold mb-2">Self-Healing PRs</h3>
              <p className="text-sm text-[#8b949e]">Let AI automatically fix bugs, security vulnerabilities, and code quality issues.</p>
            </div>
            <div className="p-6 border border-[#1c2528] rounded-xl bg-[#0f1418]">
              <h3 className="text-[#bc8cff] font-semibold mb-2">BYOK Support</h3>
              <p className="text-sm text-[#8b949e]">Bring Your Own Key support makes Code-Police fully sustainable for OSS communities.</p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
