"use client";

import * as React from "react";
import { Check, Send, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationCardProps {
    className?: string;
    avatarUrl?: string;
    avatarFallback?: string | React.ReactNode;
    avatarClassName?: string;
    isOnline?: boolean;
    userName: string;
    userRole?: string;
    message: string;
    timestamp: string;
    isRead?: boolean;
    onReply?: () => void;
    onClick?: () => void;
}

export function NotificationCard({
    className,
    avatarUrl,
    avatarFallback,
    avatarClassName,
    isOnline = false,
    userName,
    userRole,
    message,
    timestamp,
    isRead = false,
    onReply,
    onClick,
}: NotificationCardProps) {
    const initials = typeof avatarFallback === "string"
        ? avatarFallback
        : userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

    return (
        <div
            className={cn(
                "group flex items-start gap-3 p-4 rounded-lg border border-zinc-800/60 bg-zinc-900/40 transition-colors",
                onClick && "cursor-pointer hover:bg-zinc-800/40 hover:border-zinc-700/60",
                !isRead && "border-l-2 border-l-zinc-400",
                className
            )}
            onClick={onClick}
        >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
                <div className={cn("w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden", avatarClassName)}>
                    {avatarUrl ? (
                        <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
                    ) : typeof avatarFallback === "string" || !avatarFallback ? (
                        <span className="text-xs font-medium text-zinc-400">{initials}</span>
                    ) : (
                        avatarFallback
                    )}
                </div>
                {isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-zinc-900" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">{userName}</span>
                    {userRole && (
                        <span className="text-xs text-zinc-600">{userRole}</span>
                    )}
                </div>

                <p className="text-sm text-zinc-400 line-clamp-2 mb-2">{message}</p>

                <div className="flex items-center gap-2 text-xs text-zinc-600">
                    <span>{timestamp}</span>
                    <span>·</span>
                    {isRead ? (
                        <span className="flex items-center gap-1">
                            Read <Check className="w-3 h-3" />
                        </span>
                    ) : (
                        <span className="text-zinc-400">Unread</span>
                    )}
                </div>
            </div>

            {/* Reply Button */}
            {onReply && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onReply();
                    }}
                    className="flex-shrink-0 p-2 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Reply"
                >
                    <Send className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

interface NotificationListProps {
    notifications: NotificationCardProps[];
    emptyMessage?: string;
}

export function NotificationList({ notifications, emptyMessage = "No notifications" }: NotificationListProps) {
    if (notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
                    <Bell className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {notifications.map((notification, index) => (
                <NotificationCard key={index} {...notification} />
            ))}
        </div>
    );
}
