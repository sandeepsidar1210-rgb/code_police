import Link from "next/link";

// Force dynamic rendering to avoid static generation issues with ClerkProvider
export const dynamic = "force-dynamic";

/**
 * Custom 404 Not Found Page
 * Uses dynamic rendering to avoid build-time issues with auth providers.
 */
export default function NotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
            <div className="text-center space-y-6 max-w-md">
                {/* 404 Heading */}
                <h1 className="text-8xl font-bold bg-gradient-to-r from-violet-500 to-purple-600 bg-clip-text text-transparent">
                    404
                </h1>

                {/* Message */}
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-zinc-100">
                        Page Not Found
                    </h2>
                    <p className="text-zinc-400">
                        The page you&apos;re looking for doesn&apos;t exist or has been moved.
                    </p>
                </div>

                {/* Back to Home Button */}
                <Link
                    href="/"
                    className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors duration-200"
                >
                    <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        />
                    </svg>
                    Back to Home
                </Link>
            </div>

            {/* Decorative gradient */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl" />
            </div>
        </div>
    );
}
