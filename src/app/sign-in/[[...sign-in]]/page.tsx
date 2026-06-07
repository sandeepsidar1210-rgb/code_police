import { SignIn } from "@clerk/nextjs";
import { AuthLayout } from "@/components/ui/auth-fuse";

/**
 * Sign In Page
 * Uses AuthLayout with 3D Spline scene
 */
export default function SignInPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your workspace"
      quote="The journey continues. Pick up where you left off."
    >
      <SignIn
        forceRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-transparent shadow-none p-0 border-0",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            socialButtonsBlockButton: "bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 hover:bg-zinc-700/50 hover:border-zinc-600",
            socialButtonsBlockButtonText: "text-sm font-medium",
            dividerLine: "bg-zinc-800",
            dividerText: "text-zinc-600 text-xs",
            formFieldLabel: "text-zinc-400 text-sm",
            formFieldInput: "bg-zinc-800/50 border-zinc-700/50 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-0",
            formButtonPrimary: "bg-zinc-200 text-zinc-900 hover:bg-white font-medium",
            footerActionLink: "text-zinc-400 hover:text-zinc-200",
            footerActionText: "text-zinc-600",
            identityPreviewEditButton: "text-zinc-400 hover:text-zinc-200",
            formFieldAction: "text-zinc-400 hover:text-zinc-200",
            otpCodeFieldInput: "bg-zinc-800/50 border-zinc-700/50 text-zinc-200",
            alert: "bg-zinc-800/50 border-zinc-700/50 text-zinc-300",
          },
        }}
      />
    </AuthLayout>
  );
}


