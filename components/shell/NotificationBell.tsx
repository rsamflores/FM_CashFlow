"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getMyNotifications,
  getMyUnreadCount,
  markAllRead,
  type NotificationRow,
} from "@/lib/actions/notifications";
import { formatDay } from "@/lib/format";

const TYPE_ICON: Record<string, string> = {
  reimbursement_submitted: "payments",
  reimbursement_paid:      "check_circle",
  reimbursement_rejected:  "cancel",
  transaction_confirmed:   "task_alt",
  price_up:                "trending_up",
  price_down:              "trending_down",
  price_change:            "sync_alt",
};

const TYPE_COLOR: Record<string, string> = {
  reimbursement_submitted: "var(--color-tertiary)",
  reimbursement_paid:      "var(--color-secondary-fixed)",
  reimbursement_rejected:  "var(--color-error)",
  transaction_confirmed:   "var(--color-primary)",
  price_up:                "var(--color-error)",
  price_down:              "var(--color-secondary-fixed)",
  price_change:            "var(--color-tertiary)",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fetch unread count on mount; refresh when window regains focus
  useEffect(() => {
    function load() {
      getMyUnreadCount().then((n) => {
        setUnreadCount(n);
        setReady(true);
      });
    }
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // Load notifications and mark all as read on open
    getMyNotifications().then((data) => {
      setNotifications(data);
      setOpen(true);
      if (data.some((n) => !n.read_at)) {
        setUnreadCount(0);
        startTransition(async () => {
          await markAllRead();
          setNotifications((prev) =>
            prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
          );
        });
      }
    });
  }

  function handleClick(notif: NotificationRow) {
    setOpen(false);
    if (notif.link) router.push(notif.link);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="p-sm text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-all relative"
        aria-label="Notificaciones"
      >
        <span className="material-symbols-outlined">notifications</span>
        {ready && unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-[3px] rounded-full flex items-center justify-center font-bold"
            style={{
              background: "var(--color-error)",
              color: "var(--color-on-error)",
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-xs z-50 rounded-2xl border border-outline-variant/20 bg-surface-container shadow-2xl overflow-hidden"
          style={{ width: 320, maxHeight: 420, overflowY: "auto" }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-surface-container px-lg py-md border-b border-outline-variant/10 flex items-center justify-between">
            <p className="text-body-sm font-bold text-on-surface">Notificaciones</p>
            {notifications.length > 0 && (
              <span className="text-label-md text-on-surface-variant">
                {notifications.length} recientes
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-sm py-xl px-lg text-center">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 40, color: "var(--color-on-surface-variant)", opacity: 0.3 }}
              >
                notifications_off
              </span>
              <p className="text-body-sm text-on-surface-variant">Sin notificaciones</p>
              <p className="text-label-md text-on-surface-variant/60">
                Los cambios de estado de tus procesos aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-outline-variant/10">
              {notifications.map((notif) => {
                const icon  = TYPE_ICON[notif.type]  ?? "info";
                const color = TYPE_COLOR[notif.type] ?? "var(--color-primary)";
                const isUnread = !notif.read_at;

                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => handleClick(notif)}
                    className="flex items-start gap-sm px-lg py-md text-left w-full transition-colors hover:bg-surface-container-high"
                    style={
                      isUnread
                        ? { background: `color-mix(in srgb, ${color} 6%, var(--color-surface-container))` }
                        : undefined
                    }
                  >
                    {/* Icon */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: color + "20" }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 16, color }}
                      >
                        {icon}
                      </span>
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-xs">
                        <p className="text-body-sm font-bold text-on-surface leading-snug">
                          {notif.title}
                        </p>
                        {isUnread && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0 mt-1"
                            style={{ background: color }}
                          />
                        )}
                      </div>
                      {notif.body && (
                        <p className="text-label-md text-on-surface-variant mt-[2px] line-clamp-2">
                          {notif.body}
                        </p>
                      )}
                      <p className="text-label-md mt-xs" style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>
                        {formatDay(notif.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
