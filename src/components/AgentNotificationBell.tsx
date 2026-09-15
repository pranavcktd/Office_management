import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { AgentNotification } from "../types";
import { formatDateTime } from "../utils/date";

/** Polls the agent's own notifications (admin -> agent one-way messages, e.g. from a bulk-select
 * action on the Agents list) and shows them as a bell dropdown with an unread badge. */
export function AgentNotificationBell() {
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const { data } = await api.get<{ notifications: AgentNotification[]; unreadCount: number }>(
        "/agent-portal/notifications"
      );
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silent — a notification bell shouldn't surface errors to the whole portal shell.
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.patch(`/agent-portal/notifications/${id}/read`);
    } catch {
      load();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">No notifications yet.</p>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b border-slate-100 px-3 py-2.5 text-sm last:border-0 dark:border-slate-800 ${
                  n.readAt ? "" : "bg-indigo-50 dark:bg-indigo-500/10"
                }`}
              >
                <p className="whitespace-pre-line text-slate-700 dark:text-slate-200">{n.message}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(n.createdAt)}</span>
                  {!n.readAt && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
