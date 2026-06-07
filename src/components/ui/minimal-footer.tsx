import Image from 'next/image';
import {
    GitHubLogoIcon,
    InstagramLogoIcon,
    LinkedInLogoIcon,
    TwitterLogoIcon,
    VideoIcon,
} from '@radix-ui/react-icons';

export function MinimalFooter() {
    const year = new Date().getFullYear();

    const company = [
        {
            title: 'About Us',
            href: '#',
        },
        {
            title: 'Careers',
            href: '#',
        },
        {
            title: 'Brand assets',
            href: '#',
        },
        {
            title: 'Privacy Policy',
            href: '#',
        },
        {
            title: 'Terms of Service',
            href: '#',
        },
    ];

    const resources = [
        {
            title: 'Blog',
            href: '#',
        },
        {
            title: 'Help Center',
            href: '#',
        },
        {
            title: 'Contact Support',
            href: '#',
        },
        {
            title: 'Community',
            href: '#',
        },
        {
            title: 'Security',
            href: '#',
        },
    ];

    const socialLinks = [
        {
            icon: <GitHubLogoIcon className="size-4" />,
            link: '#',
        },
        {
            icon: <InstagramLogoIcon className="size-4" />,
            link: '#',
        },
        {
            icon: <LinkedInLogoIcon className="size-4" />,
            link: '#',
        },
        {
            icon: <TwitterLogoIcon className="size-4" />,
            link: '#',
        },
        {
            icon: <VideoIcon className="size-4" />,
            link: '#',
        },
    ];
    return (
        <footer className="relative">
            <div className="bg-[radial-gradient(35%_80%_at_30%_0%,var(--tw-gradient-from)_0%,transparent_100%)] from-foreground/10 mx-auto max-w-4xl md:border-x border-border">
                <div className="bg-border absolute inset-x-0 h-px w-full" />
                <div className="grid max-w-4xl grid-cols-6 gap-6 p-4">
                    <div className="col-span-6 flex flex-col gap-5 md:col-span-4">
                        <a href="#" className="flex items-center gap-2">
                            <Image
                                src="/zero3.png"
                                alt="Protocol Zero Logo"
                                width={40}
                                height={40}
                                className="rounded-lg"
                            />
                            <span className="text-lg font-semibold text-foreground">Protocol Zero</span>
                        </a>
                        <p className="text-muted-foreground max-w-sm font-mono text-sm text-balance">
                            A comprehensive financial technology platform.
                        </p>
                        <div className="flex gap-2">
                            {socialLinks.map((item, i) => (
                                <a
                                    key={i}
                                    className="hover:bg-accent rounded-md border border-border p-1.5 transition-colors"
                                    target="_blank"
                                    href={item.link}
                                >
                                    {item.icon}
                                </a>
                            ))}
                        </div>
                    </div>
                    <div className="col-span-3 w-full md:col-span-1">
                        <span className="text-muted-foreground mb-1 text-xs">
                            Resources
                        </span>
                        <div className="flex flex-col gap-1">
                            {resources.map(({ href, title }, i) => (
                                <a
                                    key={i}
                                    className={`w-max py-1 text-sm duration-200 hover:underline`}
                                    href={href}
                                >
                                    {title}
                                </a>
                            ))}
                        </div>
                    </div>
                    <div className="col-span-3 w-full md:col-span-1">
                        <span className="text-muted-foreground mb-1 text-xs">Company</span>
                        <div className="flex flex-col gap-1">
                            {company.map(({ href, title }, i) => (
                                <a
                                    key={i}
                                    className={`w-max py-1 text-sm duration-200 hover:underline`}
                                    href={href}
                                >
                                    {title}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="bg-border absolute inset-x-0 h-px w-full" />
                <div className="flex max-w-4xl flex-col justify-between gap-2 pt-2 pb-5">
                    <p className="text-muted-foreground text-center font-thin">
                        © GhostHunter. All rights reserved {year}
                    </p>
                </div>
            </div>
        </footer>
    );
}

export default MinimalFooter;
