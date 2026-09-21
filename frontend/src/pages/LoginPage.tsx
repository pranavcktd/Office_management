import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, extractErrorMessage } from "../api/client";
import { LanguageToggle } from "../components/LanguageToggle";
import { LiveClock } from "../components/LiveClock";
import { MaintenanceCountdown } from "../components/MaintenanceCountdown";
import { SystemContactFooter } from "../components/SystemContactFooter";
import { ThemeToggle } from "../components/ThemeToggle";
import { useLanguage } from "../hooks/useLanguage";
import { useMaintenanceStatus } from "../hooks/useMaintenanceStatus";
import { useSiteContent } from "../hooks/useSiteContent";

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M4 6.5 12 13l8-6.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

function CheckBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-amber-400">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.3 2.3 4.7-5" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="4" y="3" width="10" height="18" rx="1" />
      <path d="M14 8h6v13h-6" />
      <path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8" r="3.3" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </svg>
  );
}

const inputBaseClass =
  "w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-500/15 dark:border-stone-700 dark:bg-stone-800 dark:text-white";

/** Notices shown on the branding panel (desktop) and re-shown above the form on narrow screens,
 * where the branding panel is hidden entirely — see the two render sites below. */
function Notices({ maintenance, loginNotice }: { maintenance: ReturnType<typeof useMaintenanceStatus>; loginNotice: string | null | undefined }) {
  if (!maintenance?.enabled && !loginNotice) return null;
  return (
    <div className="space-y-3">
      {maintenance?.enabled && (
        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2.5">
          <p className="whitespace-pre-line text-xs text-amber-100">
            <strong className="block font-semibold text-amber-200">Under maintenance</strong>
            {maintenance.message || "We're working on updates to the app — please check back shortly."}
            <span className="mt-1 block">Admin sign-in still works.</span>
          </p>
          <div className="mt-2.5 border-t border-amber-500/20 pt-2.5">
            <MaintenanceCountdown until={maintenance.until} />
          </div>
        </div>
      )}
      {loginNotice && (
        <p className="whitespace-pre-line rounded-lg border-l-4 border-stone-400 bg-white/5 px-3 py-2.5 text-xs text-stone-100">
          {loginNotice}
        </p>
      )}
    </div>
  );
}

export function LoginPage() {
  const { staffLogin, agentLogin } = useAuth();
  const { t } = useLanguage();
  const siteContent = useSiteContent();
  const maintenance = useMaintenanceStatus();
  const navigate = useNavigate();
  const [portal, setPortal] = useState<"staff" | "agent">("staff");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (portal === "staff") {
        await staffLogin(email, password);
      } else {
        await agentLogin(email, password);
      }
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotMessage(null);
    setForgotSubmitting(true);
    try {
      const { data } = await api.post<{ message: string }>("/auth/forgot-password", { email: forgotEmail });
      setForgotMessage(data.message);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Branding + notices panel — visual only, hidden on narrow screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-stone-900 p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-stone-700/20 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-base font-bold">
              OM
            </div>
            <span className="text-lg font-semibold tracking-tight">Office Management</span>
          </div>
          <h1 className="mb-3 max-w-md text-3xl font-bold leading-tight">{t("login_title")}</h1>
          <p className="mb-1 max-w-sm text-sm leading-relaxed text-stone-300">{t("login_tagline")}</p>
          <LiveClock className="mb-8 block text-xs font-medium text-stone-400" />

          <Notices maintenance={maintenance} loginNotice={siteContent?.loginNotice} />

          <ul className="mt-8 space-y-3.5 text-sm text-stone-200">
            <li className="flex items-center gap-2.5">
              <CheckBadgeIcon />
              {t("login_feature_pan_tan")}
            </li>
            <li className="flex items-center gap-2.5">
              <CheckBadgeIcon />
              {t("login_feature_tracking")}
            </li>
            <li className="flex items-center gap-2.5">
              <CheckBadgeIcon />
              {t("login_feature_reports")}
            </li>
          </ul>
        </div>

        <p className="relative z-10 text-xs text-stone-400">
          © {new Date().getFullYear()} Office Management Portal
        </p>
      </div>

      {/* Form panel — kept to just the sign-in form; notices live on the left above */}
      <div className="flex w-full flex-1 flex-col lg:w-1/2">
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white dark:bg-stone-100 dark:text-stone-900">
              OM
            </div>
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Office Management</span>
          </div>
          <LiveClock className="hidden text-xs font-medium text-stone-400 dark:text-stone-500 sm:block lg:hidden" />
          <div className="ml-auto flex gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile-only fallback: the branding panel (and its notices) is hidden below lg, so
            surface the same notices here instead of dropping them. */}
        {(maintenance?.enabled || siteContent?.loginNotice) && (
          <div className="px-4 lg:hidden">
            <div className="mx-auto mb-2 w-full max-w-sm rounded-xl bg-stone-900 p-4">
              <Notices maintenance={maintenance} loginNotice={siteContent?.loginNotice} />
            </div>
          </div>
        )}

        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">
            <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-lg shadow-stone-200/50 dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
              <h1 className="mb-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {mode === "login" ? t("login_sign_in_subtitle") : t("login_reset_subtitle")}
              </h1>
              <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
                {mode === "login" ? t("login_welcome_back") : "Enter the email on file for your account."}
              </p>

              {mode === "login" ? (
                <>
                  <div className="mb-6 flex rounded-xl bg-stone-100 p-1 text-sm dark:bg-stone-800">
                    <button
                      type="button"
                      onClick={() => setPortal("staff")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium transition ${
                        portal === "staff"
                          ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                          : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                      }`}
                    >
                      <BuildingIcon />
                      {t("login_staff_admin")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPortal("agent")}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium transition ${
                        portal === "agent"
                          ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                          : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                      }`}
                    >
                      <UserIcon />
                      {t("login_agent_portal")}
                    </button>
                  </div>

                  <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                        {t("login_email")}
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                          <MailIcon />
                        </span>
                        <input
                          type="email"
                          autoFocus
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputBaseClass}
                          placeholder="you@example.com"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                          {t("login_password")}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("forgot");
                            setError(null);
                            setForgotMessage(null);
                          }}
                          className="text-xs font-medium text-stone-500 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100"
                        >
                          {t("login_forgot_password")}
                        </button>
                      </div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                          <LockIcon />
                        </span>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={inputBaseClass}
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-60 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
                    >
                      {loading ? t("login_signing_in") : t("login_sign_in")}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <form onSubmit={onForgotSubmit} className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                        {t("login_email")}
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
                          <MailIcon />
                        </span>
                        <input
                          type="email"
                          autoFocus
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className={inputBaseClass}
                          required
                        />
                      </div>
                    </div>

                    {forgotMessage && (
                      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {forgotMessage}
                      </p>
                    )}
                    {error && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={forgotSubmitting}
                      className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-60 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
                    >
                      {forgotSubmitting ? t("login_sending") : t("login_send_new_password")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setError(null);
                      }}
                      className="w-full rounded-lg border border-stone-300 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                    >
                      {t("login_back_to_sign_in")}
                    </button>
                  </form>
                </>
              )}
            </div>
            <p className="mt-6 text-center text-xs text-stone-400 dark:text-stone-600">
              {t("login_secure_notice")}
            </p>
          </div>
        </div>
        <SystemContactFooter />
      </div>
    </div>
  );
}
