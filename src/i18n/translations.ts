// Navigation & chrome translations only (sidebar, header, login, common actions, page titles) —
// data entered into the app (names, notes, applicant details) is never translated. Add a key
// here and reference it via useLanguage().t("key") from any component; falls back to English if
// a Hindi string is ever missing.
export const TRANSLATIONS = {
  // Nav sections
  nav_overview: { en: "Overview", hi: "अवलोकन" },
  nav_applications: { en: "Applications", hi: "आवेदन" },
  nav_operations: { en: "Operations", hi: "संचालन" },
  nav_people: { en: "People", hi: "लोग" },
  nav_admin: { en: "Admin", hi: "व्यवस्थापक" },

  // Nav items — admin/staff
  nav_dashboard: { en: "Dashboard", hi: "डैशबोर्ड" },
  nav_reports: { en: "Reports", hi: "रिपोर्ट" },
  nav_pan: { en: "PAN Applications", hi: "पैन आवेदन" },
  nav_tan: { en: "TAN Applications", hi: "टैन आवेदन" },
  nav_dispatch: { en: "Inward/Outward", hi: "आवक/जावक" },
  nav_queries: { en: "Client Queries", hi: "ग्राहक प्रश्न" },
  nav_attendance: { en: "Attendance", hi: "उपस्थिति" },
  nav_agents: { en: "Agents", hi: "एजेंट" },
  nav_fee_matrix: { en: "Fee Matrix", hi: "शुल्क सारणी" },
  nav_users: { en: "Users", hi: "उपयोगकर्ता" },
  nav_audit: { en: "Audit Trail", hi: "ऑडिट ट्रेल" },
  nav_documents: { en: "Documents", hi: "दस्तावेज़" },
  nav_settings: { en: "Settings", hi: "सेटिंग्स" },
  nav_backup: { en: "Backup & Restore", hi: "बैकअप और पुनर्स्थापना" },

  // Nav items — agent portal
  nav_my_applications: { en: "My Applications", hi: "मेरे आवेदन" },
  nav_my_queries: { en: "My Queries", hi: "मेरे प्रश्न" },

  // Header/top bar
  last_login: { en: "Last login", hi: "पिछला लॉगिन" },
  profile: { en: "Profile", hi: "प्रोफ़ाइल" },
  sign_out: { en: "Sign out", hi: "साइन आउट" },
  change_password: { en: "Change Password", hi: "पासवर्ड बदलें" },

  // Common actions (buttons used across many pages)
  save: { en: "Save", hi: "सहेजें" },
  save_changes: { en: "Save Changes", hi: "परिवर्तन सहेजें" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  edit: { en: "Edit", hi: "संपादित करें" },
  delete: { en: "Delete", hi: "हटाएं" },
  back: { en: "Back", hi: "वापस" },
  close: { en: "Close", hi: "बंद करें" },
  search: { en: "Search", hi: "खोजें" },
  export: { en: "Export", hi: "निर्यात" },
  export_xls: { en: "Export XLS", hi: "एक्सएलएस निर्यात करें" },
  export_pdf: { en: "Export PDF", hi: "पीडीएफ़ निर्यात करें" },
  exporting: { en: "Exporting…", hi: "निर्यात हो रहा है…" },
  welcome_back: { en: "Welcome back, {name}", hi: "वापसी पर स्वागत है, {name}" },

  // Change Password page
  change_password_title_forced: { en: "Choose a new password", hi: "एक नया पासवर्ड चुनें" },
  change_password_title_normal: { en: "Change your password", hi: "अपना पासवर्ड बदलें" },
  current_password: { en: "Current password", hi: "वर्तमान पासवर्ड" },
  new_password: { en: "New password", hi: "नया पासवर्ड" },
  confirm_new_password: { en: "Confirm new password", hi: "नए पासवर्ड की पुष्टि करें" },
  set_new_password: { en: "Set New Password", hi: "नया पासवर्ड सेट करें" },
  saving: { en: "Saving…", hi: "सहेजा जा रहा है…" },
  sign_out_instead: { en: "Sign out instead", hi: "इसके बजाय साइन आउट करें" },

  // Profile page
  my_profile: { en: "My Profile", hi: "मेरी प्रोफ़ाइल" },
  full_name: { en: "Full Name", hi: "पूरा नाम" },
  agent_name: { en: "Agent Name", hi: "एजेंट का नाम" },
  firm_name: { en: "Firm Name", hi: "फर्म का नाम" },
  mobile: { en: "Mobile", hi: "मोबाइल" },
  address: { en: "Address", hi: "पता" },
  email_readonly: { en: "Email (read-only)", hi: "ईमेल (केवल पढ़ने योग्य)" },
  profile_updated: { en: "Profile updated.", hi: "प्रोफ़ाइल अपडेट हो गई।" },
  view: { en: "View", hi: "देखें" },
  loading: { en: "Loading…", hi: "लोड हो रहा है…" },
  status: { en: "Status", hi: "स्थिति" },
  all: { en: "All", hi: "सभी" },
  prev: { en: "Prev", hi: "पिछला" },
  next: { en: "Next", hi: "अगला" },
  page_of: { en: "Page {page} of {total}", hi: "पृष्ठ {page} / {total}" },
  showing_of: { en: "Showing {start}–{end} of {total}", hi: "{total} में से {start}–{end} दिखा रहे हैं" },
  per_page: { en: "{size} / page", hi: "{size} / पृष्ठ" },

  // Login page
  login_title: { en: "Office Management Portal", hi: "कार्यालय प्रबंधन पोर्टल" },
  login_sign_in_subtitle: { en: "Sign in to continue", hi: "जारी रखने के लिए साइन इन करें" },
  login_reset_subtitle: { en: "Reset your password", hi: "अपना पासवर्ड रीसेट करें" },
  login_staff_admin: { en: "Staff / Admin", hi: "स्टाफ / व्यवस्थापक" },
  login_agent_portal: { en: "Agent Portal", hi: "एजेंट पोर्टल" },
  login_email: { en: "Email", hi: "ईमेल" },
  login_password: { en: "Password", hi: "पासवर्ड" },
  login_forgot_password: { en: "Forgot password?", hi: "पासवर्ड भूल गए?" },
  login_sign_in: { en: "Sign in", hi: "साइन इन करें" },
  login_signing_in: { en: "Signing in...", hi: "साइन इन हो रहा है..." },
  login_back_to_sign_in: { en: "Back to sign in", hi: "साइन इन पर वापस जाएं" },
  login_send_new_password: { en: "Send New Password", hi: "नया पासवर्ड भेजें" },
  login_sending: { en: "Sending…", hi: "भेजा जा रहा है…" },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS;
