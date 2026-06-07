"use client";
import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { IconCheck, IconCopy } from "@tabler/icons-react";

type Highlight = {
  line: number;
  color?: string;
  annotation?: string;
};

type CodeBlockProps = {
  language: string;
  filename: string;
  highlights?: Highlight[];
} & (
  | {
      code: string;
      tabs?: never;
    }
  | {
      code?: never;
      tabs: Array<{
        name: string;
        code: string;
        language?: string;
        highlights?: Highlight[];
      }>;
    }
);

export const CodeBlock = ({
  language,
  filename,
  code,
  highlights = [],
  tabs = [],
}: CodeBlockProps) => {
  const [copied, setCopied] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);

  const tabsExist = tabs.length > 0;

  const copyToClipboard = async () => {
    const textToCopy = tabsExist ? tabs[activeTab].code : code;
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeCode = tabsExist ? tabs[activeTab].code : code;
  const activeLanguage = tabsExist
    ? tabs[activeTab].language || language
    : language;
  const activeHighlights = tabsExist
    ? tabs[activeTab].highlights || []
    : highlights;

  // Constants for layout
  const LINE_HEIGHT = 24; // px
  const FONT_SIZE = 14; // px

  return (
    <div className="relative w-full rounded-lg bg-neutral-950 border border-neutral-800 p-4 font-mono text-sm group/code">
      <div className="flex flex-col gap-2 mb-2">
        {tabsExist && (
          <div className="flex overflow-x-auto gap-2">
            {tabs.map((tab, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`px-3 py-1 text-xs transition-colors rounded-md font-sans ${
                  activeTab === index
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        )}
        {!tabsExist && filename && (
          <div className="flex justify-between items-center py-1">
            <div className="text-xs text-zinc-400 font-medium">{filename}</div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-sans"
            >
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </button>
          </div>
        )}
      </div>
      
      <div className="relative overflow-hidden">
         {/* Code container */}
         <div className="overflow-x-auto relative font-mono text-sm">
            <SyntaxHighlighter
                language={activeLanguage}
                style={atomDark}
                customStyle={{
                margin: 0,
                padding: "0 0 0 0", 
                background: "transparent",
                fontSize: `${FONT_SIZE}px`,
                lineHeight: `${LINE_HEIGHT}px`,
                }}
                wrapLines={true}
                showLineNumbers={true}
                lineProps={(lineNumber) => {
                    const highlight = activeHighlights.find(h => h.line === lineNumber);
                    return {
                        style: {
                            backgroundColor: highlight
                            ? highlight.color || "rgba(239, 68, 68, 0.2)"
                            : "transparent",
                            display: "block",
                            width: "100%",
                        },
                    };
                }}
                PreTag="div"
            >
                {String(activeCode)}
            </SyntaxHighlighter>
         </div>

         {/* Annotations Overlay */}
         <div className="absolute top-0 right-0 h-full w-full pointer-events-none select-none">
            {activeHighlights.map((highlight, idx) => {
                if (!highlight.annotation) return null;
                return (
                    <div
                        key={idx}
                        className="absolute right-0 flex items-center h-6 pr-4"
                        style={{
                            top: `${(highlight.line - 1) * LINE_HEIGHT}px`,
                        }}
                    >
                        <div className="flex items-center gap-2 justify-end">
                            <div className="bg-red-900/80 border border-red-500/50 shadow-sm shadow-red-500/20 backdrop-blur-md px-2 py-0.5 rounded text-[10px] sm:text-xs text-red-100 whitespace-nowrap">
                                <span className="text-red-400 font-bold mr-1">Fix:</span>
                                {highlight.annotation}
                            </div>
                        </div>
                    </div>
                );
            })}
         </div>
      </div>
    </div>
  );
};
