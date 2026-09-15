import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./hooks/useTheme";
import { LanguageProvider } from "./hooks/useLanguage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AgentLayout } from "./layout/AgentLayout";
import { AppLayout } from "./layout/AppLayout";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LoginPage } from "./pages/LoginPage";
import { DocumentsPage } from "./pages/documents/DocumentsPage";
import { AgentApplicationDetailPage } from "./pages/portal/AgentApplicationDetailPage";
import { AgentApplicationsPage } from "./pages/portal/AgentApplicationsPage";
import { AgentPanDraftFormPage } from "./pages/portal/AgentPanDraftFormPage";
import { AgentTanDraftFormPage } from "./pages/portal/AgentTanDraftFormPage";
import { AgentDashboardPage } from "./pages/portal/AgentDashboardPage";
import { AgentDocumentsPage } from "./pages/portal/AgentDocumentsPage";
import { AgentQueriesPage } from "./pages/portal/AgentQueriesPage";
import { AgentFormPage } from "./pages/agents/AgentFormPage";
import { AgentListPage } from "./pages/agents/AgentListPage";
import { AgentPortalViewPage } from "./pages/agents/AgentPortalViewPage";
import { AttendanceMonthlyPage } from "./pages/attendance/AttendanceMonthlyPage";
import { AttendancePage } from "./pages/attendance/AttendancePage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { DispatchDetailPage } from "./pages/dispatch/DispatchDetailPage";
import { DispatchFormPage } from "./pages/dispatch/DispatchFormPage";
import { DispatchListPage } from "./pages/dispatch/DispatchListPage";
import { PanDetailPage } from "./pages/pan/PanDetailPage";
import { PanFormPage } from "./pages/pan/PanFormPage";
import { PanListPage } from "./pages/pan/PanListPage";
import { QueryDetailPage } from "./pages/queries/QueryDetailPage";
import { QueryFormPage } from "./pages/queries/QueryFormPage";
import { QueryListPage } from "./pages/queries/QueryListPage";
import { CategoriesSettingsPage } from "./pages/settings/CategoriesSettingsPage";
import { EmailSettingsPage } from "./pages/settings/EmailSettingsPage";
import { FieldRequirementsSettingsPage } from "./pages/settings/FieldRequirementsSettingsPage";
import { ProteanMappingSettingsPage } from "./pages/settings/ProteanMappingSettingsPage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { SiteContentSettingsPage } from "./pages/settings/SiteContentSettingsPage";
import { AuditTrailPage } from "./pages/audit/AuditTrailPage";
import { FeeMatrixPage } from "./pages/fee-matrix/FeeMatrixPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { BackupPage } from "./pages/backup/BackupPage";
import { UserFormPage } from "./pages/users/UserFormPage";
import { UsersListPage } from "./pages/users/UsersListPage";
import { TanDetailPage } from "./pages/tan/TanDetailPage";
import { TanFormPage } from "./pages/tan/TanFormPage";
import { TanListPage } from "./pages/tan/TanListPage";

function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* AUDITOR joins ADMIN/STAFF here for every read view — list, detail, dashboard, reports.
            It never appears on any nested block below that creates/edits/deletes anything. */}
        <Route element={<ProtectedRoute roles={["ADMIN", "STAFF", "AUDITOR"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />

            <Route path="/pan" element={<PanListPage />} />
            <Route path="/tan" element={<TanListPage />} />
            <Route path="/agents" element={<AgentListPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/attendance/monthly" element={<AttendanceMonthlyPage />} />
            <Route path="/dispatch" element={<DispatchListPage />} />
            <Route path="/queries" element={<QueryListPage />} />
            <Route path="/documents" element={<DocumentsPage />} />

            {/* Staff/Admin entry routes — never AUDITOR */}
            <Route element={<ProtectedRoute roles={["ADMIN", "STAFF"]} />}>
              <Route path="/pan/new" element={<PanFormPage />} />
              <Route path="/tan/new" element={<TanFormPage />} />
              <Route path="/dispatch/new" element={<DispatchFormPage />} />
              <Route path="/queries/new" element={<QueryFormPage />} />
              <Route path="/queries/:id/edit" element={<QueryFormPage />} />
            </Route>

            {/* Admin-only create/edit/delete/settings routes — never AUDITOR */}
            <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
              <Route path="/pan/:id/edit" element={<PanFormPage />} />
              <Route path="/tan/:id/edit" element={<TanFormPage />} />
              <Route path="/agents/new" element={<AgentFormPage />} />
              <Route path="/agents/:id/edit" element={<AgentFormPage />} />
              <Route path="/dispatch/:id/edit" element={<DispatchFormPage />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/categories" replace />} />
                <Route path="categories" element={<CategoriesSettingsPage />} />
                <Route path="field-requirements" element={<FieldRequirementsSettingsPage />} />
                <Route path="protean-mapping" element={<ProteanMappingSettingsPage />} />
                <Route path="email" element={<EmailSettingsPage />} />
                <Route path="site-content" element={<SiteContentSettingsPage />} />
              </Route>
              <Route path="/users/new" element={<UserFormPage />} />
              <Route path="/users/:id/edit" element={<UserFormPage />} />
              <Route path="/backup" element={<BackupPage />} />
            </Route>

            {/* Admin + Auditor read-only views */}
            <Route element={<ProtectedRoute roles={["ADMIN", "AUDITOR"]} />}>
              <Route path="/agents/:agentId/portal" element={<AgentPortalViewPage />} />
              <Route path="/users" element={<UsersListPage />} />
              <Route path="/audit" element={<AuditTrailPage />} />
              <Route path="/fee-matrix" element={<FeeMatrixPage />} />
              <Route path="/reports" element={<ReportsPage />} />
            </Route>

            {/* :id view routes come after /new and /:id/edit so those aren't swallowed as an id */}
            <Route path="/pan/:id" element={<PanDetailPage />} />
            <Route path="/tan/:id" element={<TanDetailPage />} />
            <Route path="/dispatch/:id" element={<DispatchDetailPage />} />
            <Route path="/queries/:id" element={<QueryDetailPage />} />
          </Route>
        </Route>

        {/* Agent self-service portal */}
        <Route element={<ProtectedRoute roles={["AGENT"]} />}>
          <Route element={<AgentLayout />}>
            <Route path="/portal" element={<AgentDashboardPage />} />
            <Route path="/portal/applications" element={<AgentApplicationsPage />} />
            <Route path="/portal/applications/pan/new" element={<AgentPanDraftFormPage />} />
            <Route path="/portal/applications/pan/:id/edit" element={<AgentPanDraftFormPage />} />
            <Route path="/portal/applications/tan/new" element={<AgentTanDraftFormPage />} />
            <Route path="/portal/applications/tan/:id/edit" element={<AgentTanDraftFormPage />} />
            <Route path="/portal/applications/:module/:id" element={<AgentApplicationDetailPage />} />
            <Route path="/portal/queries" element={<AgentQueriesPage />} />
            <Route path="/portal/documents" element={<AgentDocumentsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
