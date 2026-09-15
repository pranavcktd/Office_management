import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, extractErrorMessage } from "../api/client";
import { LanguageToggle } from "../components/LanguageToggle";
import { SystemContactFooter } from "../components/SystemContactFooter";
import { ThemeToggle } from "../components/ThemeToggle";
import { useLanguage } from "../hooks/useLanguage";
import { useSiteContent } from "../hooks/useSiteContent";

export function LoginPage() {
  const { staffLogin, agentLogin } = useAuth();
  const { t } = useLanguage();
  const siteContent = useSiteContent();
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
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex justify-end gap-2 p-4">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t("login_title")}
        </h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {mode === "login" ? t("login_sign_in_subtitle") : t("login_reset_subtitle")}
        </p>

        {siteContent?.loginNotice && (
          <p className="mb-5 whitespace-pre-line rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300">
            {siteContent.loginNotice}
          </p>
        )}

        {mode === "login" ? (
          <>
            <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setPortal("staff")}
                className={`flex-1 rounded-md py-1.5 font-medium transition ${
                  portal === "staff"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t("login_staff_admin")}
              </button>
              <button
                type="button"
                onClick={() => setPortal("agent")}
                className={`flex-1 rounded-md py-1.5 font-medium transition ${
                  portal === "agent"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {t("login_agent_portal")}
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("login_email")}
                </label>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("login_password")}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setForgotMessage(null);
                    }}
                    className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {t("login_forgot_password")}
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? t("login_signing_in") : t("login_sign_in")}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Enter the email on file for your account. If it matches one, we'll email a new
              temporary password to it.
            </p>
            <form onSubmit={onForgotSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("login_email")}
                </label>
                <input
                  type="email"
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              {forgotMessage && (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {forgotMessage}
                </p>
              )}
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={forgotSubmitting}
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {forgotSubmitting ? t("login_sending") : t("login_send_new_password")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t("login_back_to_sign_in")}
              </button>
            </form>
          </>
        )}
      </div>
      </div>
      <SystemContactFooter />
    </div>
  );
}
