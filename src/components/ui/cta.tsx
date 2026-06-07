import { ArrowRightIcon, PlusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/Button";

export function CallToAction() {
    return (
        <div className="relative mx-auto flex w-full max-w-3xl flex-col justify-between gap-y-6 border-y border-border bg-[radial-gradient(35%_80%_at_25%_0%,var(--tw-gradient-from)_0%,transparent_100%)] from-foreground/8 px-4 py-8">
            <PlusIcon
                className="absolute top-[-12.5px] left-[-11.5px] z-1 size-6 text-muted-foreground"
                strokeWidth={1}
            />
            <PlusIcon
                className="absolute top-[-12.5px] right-[-11.5px] z-1 size-6 text-muted-foreground"
                strokeWidth={1}
            />
            <PlusIcon
                className="absolute bottom-[-12.5px] left-[-11.5px] z-1 size-6 text-muted-foreground"
                strokeWidth={1}
            />
            <PlusIcon
                className="absolute right-[-11.5px] bottom-[-12.5px] z-1 size-6 text-muted-foreground"
                strokeWidth={1}
            />

            <div className="-inset-y-6 pointer-events-none absolute left-0 w-px border-l border-border" />
            <div className="-inset-y-6 pointer-events-none absolute right-0 w-px border-r border-border" />

            <div className="-z-10 absolute top-0 left-1/2 h-full border-l border-dashed border-border" />


            <div className="space-y-1">
                <h2 className="text-center font-bold text-2xl">
                    Let your plans shape the future.
                </h2>
                <p className="text-center text-muted-foreground">
                    Start your free trial today. No credit card required.
                </p>
            </div>

            <div className="flex items-center justify-center gap-2">
                <Button variant="outline">Contact Sales</Button>
                <Button>
                    Get Started <ArrowRightIcon className="size-4 ml-1" />
                </Button>
            </div>
        </div>
    );
}

export default CallToAction;
