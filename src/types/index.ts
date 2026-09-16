export type StaffRole = "ADMIN" | "STAFF" | "AUDITOR";
export type Principal = "ADMIN" | "STAFF" | "AUDITOR" | "AGENT";

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  // Sum of feeAmount across the whole filtered set (not just the current page) — present on
  // PAN/TAN list responses only.
  totalFee?: number;
}

// Attendance is deliberately not a module key — it's universal self-service (every staff member
// punches their own attendance), not a discretionary business-function grant like the ones below.
export const MODULE_KEYS = ["pan", "tan", "agents", "dispatch", "queries"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export const MODULE_LABELS: Record<ModuleKey, string> = {
  pan: "PAN Applications",
  tan: "TAN Applications",
  agents: "Agents",
  dispatch: "Inward/Outward",
  queries: "Client Queries",
};

export interface AuthUser {
  id: number;
  role: Principal;
  fullName?: string;
  agentName?: string;
  firmName?: string | null;
  mobile?: string;
  email?: string | null;
  address?: string | null;
  /** null for ADMIN (all modules); array of granted module keys for STAFF. */
  modules?: ModuleKey[] | null;
  /** True when the current password is a default/reset value — must change it before doing anything else. */
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
}

export interface Staff {
  id: number;
  fullName: string;
  mobile: string;
  email: string;
  role: StaffRole;
  modules?: ModuleKey[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface AppDocument {
  id: number;
  title: string;
  description?: string | null;
  originalName: string;
  uploadedBy?: { id: number; fullName: string } | null;
  createdAt: string;
}

export type QueryExtraField = "PAN" | "AADHAAR" | "TAX_YEAR";
export const QUERY_EXTRA_FIELD_LABELS: Record<QueryExtraField, string> = {
  PAN: "PAN Number",
  AADHAAR: "Aadhaar Number",
  TAX_YEAR: "Tax Year",
};

export interface MasterCategory {
  id: number;
  kind: "SERVICE" | "DISPATCH_ITEM";
  name: string;
  isActive: boolean;
  sortOrder: number;
  // SERVICE categories only — see QueryFormPage.tsx.
  requiredQueryFields?: QueryExtraField[];
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  actorKind: string;
  actorId?: number | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId: number;
  meta?: unknown;
  createdAt: string;
}

export type LedgerEntryType = "DEBIT" | "CREDIT";

export interface StaffLedgerEntry {
  id: number;
  staffId: number;
  type: LedgerEntryType;
  amount: string;
  note: string;
  entryDate: string;
  createdBy?: { id: number; fullName: string } | null;
  createdAt: string;
}

export interface StaffLedgerSummaryRow {
  staffId: number;
  staffName: string;
  // Positive = staff owes the office; negative = office owes the staff.
  balance: number;
}

export type AttendanceStatus = "PRESENT" | "HALF_DAY" | "ABSENT" | "OVERTIME";

export interface AttendanceLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface AttendanceRecord {
  id: number;
  staffId: number;
  staff?: { id: number; fullName: string };
  workDate: string;
  shift1In?: string | null;
  shift1Out?: string | null;
  shift2In?: string | null;
  shift2Out?: string | null;
  shift1InLocation?: AttendanceLocation | null;
  shift1OutLocation?: AttendanceLocation | null;
  shift2InLocation?: AttendanceLocation | null;
  shift2OutLocation?: AttendanceLocation | null;
  status: AttendanceStatus;
  overrideNote?: string | null;
  overriddenById?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyAttendanceReport {
  staffId: number;
  month: number;
  year: number;
  totalHours: number;
  summary: Record<AttendanceStatus, number>;
  records: AttendanceRecord[];
}

export type ApplicationType = "NEW" | "CORRECTION";
export type PanApplicantStatus = "INDIVIDUAL" | "NON_INDIVIDUAL";
export type ResidencyStatus = "RESIDENT" | "NON_RESIDENT";
export type SignedStatus = "SIGNATURE" | "THUMB";
export type SourceType = "OFFICE" | "AGENT";
export type PaymentMode = "CASH" | "ONLINE" | "OTHER" | "ADJUSTED";
export type FormStatus = "AGENT_DRAFT" | "UNDER_ENTRY" | "PUSHED_TO_NSDL" | "ACK_GENERATED" | "REJECTED";
export type ApplicantCategory = "INDIVIDUAL" | "FIRM" | "GOVERNMENT" | "PRIVATE_LTD" | "OTHER";
export type RejectionReason =
  | "ALREADY_ISSUED"
  | "DEMOGRAPHIC_FAILED"
  | "DATA_INCOMPLETE"
  | "SIGNATURE_PHOTO_MISMATCH"
  | "OTHER";

export type FeeModuleKey = "PAN" | "TAN";
export type FeeApplicationType = "NEW" | "CORRECTION";
/** "" for TAN (no signature/thumb distinction); "SIGNATURE" or "THUMB" for PAN. */
export type FeeSignedStatus = "" | "SIGNATURE" | "THUMB";

export interface AgentFeeRate {
  module: FeeModuleKey;
  applicationType: FeeApplicationType;
  signedStatus: FeeSignedStatus;
  label: string;
  amount: number | null;
}

export interface AgentEmailEntry {
  id: number;
  email: string;
  isLogin: boolean;
}

export interface Agent {
  id: number;
  agentName: string;
  firmName?: string | null;
  mobile: string;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  notes?: string | null;
  hasPortalAccess?: boolean;
  feeRates?: AgentFeeRate[];
  emails?: AgentEmailEntry[];
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface AgentNotification {
  id: number;
  agentId: number;
  message: string;
  createdAt: string;
  readAt?: string | null;
}

export interface AgentLedger {
  agentId: number;
  forms: { submitted: number; accepted: number; rejected: number; underEntry?: number };
  adjustmentBalance: number;
  /** Positive = agent owes the office; negative = the office owes the agent. */
  feeDueFromAgent: number;
  breakdown: {
    pan: { submitted: number; accepted: number; rejected: number; underEntry?: number; adjustmentAvailable: number };
    tan: { submitted: number; accepted: number; rejected: number; underEntry?: number; adjustmentAvailable: number };
  };
}

export interface PanApplication {
  id: number;
  applicationType: ApplicationType;
  applicantStatus: PanApplicantStatus;
  residencyStatus: ResidencyStatus;
  applicantName: string;
  fatherName?: string | null;
  dob?: string | null;
  mobile?: string | null;
  email?: string | null;
  aadhaarNumber?: string | null;
  guardianAadhaarNumber?: string | null;
  existingPan?: string | null;
  signedStatus: SignedStatus;
  sourceType: SourceType;
  agentId?: number | null;
  agent?: { id: number; agentName: string } | null;
  feeAmount: string;
  standardFeeAmount?: string | null;
  paymentMode: PaymentMode;
  paymentOtherDetail?: string | null;
  onlinePaymentDetail?: string | null;
  cashReceivedById?: number | null;
  cashReceivedBy?: { id: number; fullName: string } | null;
  status: FormStatus;
  rejectionReason?: RejectionReason | null;
  rejectionOtherDetail?: string | null;
  rejectionDate?: string | null;
  adjustmentAvailable: boolean;
  adjustmentExpiredAt?: string | null;
  adjustedFromFormId?: number | null;
  adjustedFrom?: { id: number; applicantName: string; rejectionReason?: RejectionReason | null; rejectionDate?: string | null } | null;
  adjustedTo?: { id: number; applicantName: string; createdAt: string } | null;
  ackNumber?: string | null;
  punchingDate?: string | null;
  formReceivedDate?: string | null;
  createdBy?: { id: number; fullName: string } | null;
  notes?: string | null;
  autoBackfilled?: boolean;
  createdAt: string;
}

export interface TanApplication {
  id: number;
  applicationType: ApplicationType;
  existingTan?: string | null;
  applicantCategory: ApplicantCategory;
  otherCategoryDetail?: string | null;
  applicantName: string;
  dob?: string | null;
  mobile?: string | null;
  sourceType: SourceType;
  agentId?: number | null;
  agent?: { id: number; agentName: string } | null;
  feeAmount: string;
  standardFeeAmount?: string | null;
  paymentMode: PaymentMode;
  paymentOtherDetail?: string | null;
  onlinePaymentDetail?: string | null;
  cashReceivedById?: number | null;
  cashReceivedBy?: { id: number; fullName: string } | null;
  status: FormStatus;
  rejectionReason?: RejectionReason | null;
  rejectionOtherDetail?: string | null;
  rejectionDate?: string | null;
  adjustmentAvailable: boolean;
  adjustmentExpiredAt?: string | null;
  adjustedFromFormId?: number | null;
  adjustedFrom?: { id: number; applicantName: string; rejectionReason?: RejectionReason | null; rejectionDate?: string | null } | null;
  adjustedTo?: { id: number; applicantName: string; createdAt: string } | null;
  ackNumber?: string | null;
  punchingDate?: string | null;
  formReceivedDate?: string | null;
  createdBy?: { id: number; fullName: string } | null;
  notes?: string | null;
  autoBackfilled?: boolean;
  createdAt: string;
}

export interface FieldRequirementEntry {
  key: string;
  label: string;
  required: boolean;
}

export interface AckPunchingImportRowResult {
  row: number;
  outcome: "matched" | "created" | "ambiguous" | "conflict" | "skipped";
  reason?: string;
  panApplicationId?: number;
  tanApplicationId?: number;
  candidateIds?: number[];
  applicantName?: string;
  ackNumber?: string;
  parsedRow?: {
    dob?: string | null;
    mobile?: string | null;
    email?: string | null;
    fatherName?: string | null;
    punchingDate?: string | null;
  };
  /** Set when the office's on-file data disagreed with this report for one or more fields (e.g.
   * a typo'd name) — the match/update still went ahead; this just flags it for admin review. */
  discrepancies?: { field: string; entered: string; reported: string }[];
}

export interface AckPunchingImportResult {
  dryRun?: boolean;
  detectedColumns?: Record<string, boolean>;
  totalRows: number;
  matched: number;
  created: number;
  ambiguous: number;
  conflict: number;
  skipped: number;
  results: AckPunchingImportRowResult[];
}

export interface BulkImportRowResult {
  row: number;
  outcome: "created" | "failed";
  reason?: string;
  applicantName?: string;
}

export interface BulkImportResult {
  totalRows: number;
  created: number;
  failed: number;
  results: BulkImportRowResult[];
}

export interface AgentFeeMatrixRow {
  id: number;
  agentName: string;
  firmName?: string | null;
  feeRates: AgentFeeRate[];
  /** Positive = agent owes the office; negative = the office owes the agent. */
  feeDueFromAgent: number;
}

export interface ProteanReportMapping {
  module: string;
  ackNumberHeader: string;
  applicantNameHeader?: string | null;
  applicantLastNameHeader?: string | null;
  firstNameHeader?: string | null;
  middleNameHeader?: string | null;
  fatherLastNameHeader?: string | null;
  fatherFirstNameHeader?: string | null;
  fatherMiddleNameHeader?: string | null;
  dobHeader?: string | null;
  emailHeader?: string | null;
  mobileHeader?: string | null;
  punchingDateHeader?: string | null;
  applicationTypeHeader?: string | null;
  updatedAt?: string | null;
}

export type ReportModule = "PAN" | "TAN" | "ALL";
export type CreditStatus = "AVAILABLE" | "TIME_BARRED" | "USED";
// "TIME_BARRED" is the internal/DB name (kept for continuity with the schema field
// adjustmentExpiredAt), but agents shouldn't read this as losing something — the credit was
// simply closed out administratively, same practical outcome as one that was actually used.
export const CREDIT_STATUS_LABELS: Record<CreditStatus, string> = {
  AVAILABLE: "Available",
  TIME_BARRED: "Cleared",
  USED: "Used",
};

export interface RejectedReportRow {
  module: "PAN" | "TAN";
  id: number;
  applicantName: string;
  mobile?: string | null;
  agentName?: string | null;
  rejectionReason?: RejectionReason | null;
  rejectionOtherDetail?: string | null;
  rejectionDate?: string | null;
  formReceivedDate?: string | null;
  createdAt: string;
  creditStatus: CreditStatus;
  adjustmentExpiredAt?: string | null;
}

export interface AdjustedReportRow {
  module: "PAN" | "TAN";
  id: number;
  applicantName: string;
  mobile?: string | null;
  agentName?: string | null;
  createdAt: string;
  originalId?: number | null;
  originalApplicantName?: string | null;
}

export interface DataEntryDiscrepancyRow {
  id: number;
  module: "PAN" | "TAN";
  applicationId: number;
  ackNumber: string;
  field: string;
  fieldLabel: string;
  enteredValue: string | null;
  reportValue: string | null;
  staffId: number | null;
  staffName: string | null;
  detectedAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  acknowledgedByName?: string | null;
}

export interface AdjustmentCandidate {
  id: number;
  applicantName: string;
  mobile: string;
  feeAmount: string;
  rejectionReason: RejectionReason;
  createdAt: string;
}

export type DispatchEntryType = "INWARD" | "OUTWARD";
export type CourierAgency = "INDIA_POST" | "DTDC" | "TRACKON" | "BY_HAND" | "OTHER";

export interface DispatchEntry {
  id: number;
  entryType: DispatchEntryType;
  itemCategoryId: number;
  itemCategory?: { id: number; name: string } | null;
  consignmentNumber?: string | null;
  courierAgency?: CourierAgency | null;
  courierOtherDetail?: string | null;
  courierDetails?: string | null;
  partyDetails: string;
  mobile?: string | null;
  receiptPath?: string | null;
  handledById: number;
  handledBy: { id: number; fullName: string };
  createdAt: string;
}

export type QueryStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface ClientQueryAuditEntry {
  id: number;
  actorName?: string | null;
  action: string;
  meta: unknown;
  createdAt: string;
}

export interface ClientQuery {
  id: number;
  clientName: string;
  mobile: string;
  email?: string | null;
  serviceCategoryId: number;
  serviceCategory?: { id: number; name: string } | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  taxYear?: string | null;
  queryText: string;
  responseText?: string | null;
  status: QueryStatus;
  assignedToId?: number | null;
  assignedTo?: { id: number; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  auditTrail?: ClientQueryAuditEntry[];
}

export interface DailyActivity {
  date: string;
  newEntries: { pan: number; tan: number; total: number };
  newRejections: { pan: number; tan: number; total: number };
  adjustmentsMade: { pan: number; tan: number; total: number };
  revenue: { newRevenue: number; adjustedRevenue: number };
  missingEntryAlerts: { pan: number; tan: number; total: number };
}

export interface DashboardSummary {
  pan: Partial<Record<FormStatus, number>> & { feeCreditsAvailable: number };
  tan: Partial<Record<FormStatus, number>> & { feeCreditsAvailable: number };
  queries: Partial<Record<QueryStatus, number>>;
  agents: { active: number; inactive: number };
  attendanceToday: Partial<Record<AttendanceStatus, number>>;
  today: DailyActivity;
}

export interface AgentPortalSummary {
  agent: {
    id: number;
    agentName: string;
    firmName?: string | null;
    mobile: string;
    email?: string | null;
    address?: string | null;
  };
  ledger: AgentLedger;
  openQueries: number;
}

export interface AgentPortalApplication {
  module: "PAN" | "TAN";
  id: number;
  applicationType: ApplicationType;
  applicantName: string;
  mobile: string;
  feeAmount: string;
  standardFeeAmount?: string | null;
  paymentMode: PaymentMode;
  status: FormStatus;
  rejectionReason?: RejectionReason | null;
  rejectionOtherDetail?: string | null;
  rejectionDate?: string | null;
  adjustmentAvailable: boolean;
  adjustmentExpiredAt?: string | null;
  adjustedFromFormId?: number | null;
  creditStatus?: CreditStatus | null;
  ackNumber?: string | null;
  formReceivedDate?: string | null;
  createdAt: string;
}

export interface AgentPortalQuery {
  id: number;
  serviceCategory?: { id: number; name: string } | null;
  queryText: string;
  responseText?: string | null;
  status: QueryStatus;
  createdAt: string;
  updatedAt: string;
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half Day",
  ABSENT: "Absent",
  OVERTIME: "Overtime",
};

export const STATUS_LABELS: Record<FormStatus, string> = {
  AGENT_DRAFT: "Pending Agent Entry",
  UNDER_ENTRY: "Under Entry",
  PUSHED_TO_NSDL: "Pushed to Protean/NSDL",
  ACK_GENERATED: "Acknowledgment Generated",
  REJECTED: "Rejected",
};

// Staff only ever choose between these two — pushing to Protean isn't a tracked step, and
// Ack Generated is set automatically by the acknowledgement Excel import (matched by Aadhaar).
export const MANUAL_STATUS_OPTIONS: FormStatus[] = ["UNDER_ENTRY", "REJECTED"];

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  ALREADY_ISSUED: "Already Issued",
  DEMOGRAPHIC_FAILED: "Demographic Failed",
  DATA_INCOMPLETE: "Data Incomplete",
  SIGNATURE_PHOTO_MISMATCH: "Signature/Photo Mismatch",
  OTHER: "Other",
};

export const APPLICANT_CATEGORY_LABELS: Record<ApplicantCategory, string> = {
  INDIVIDUAL: "Individual",
  FIRM: "Firm",
  GOVERNMENT: "Government",
  PRIVATE_LTD: "Private Ltd",
  OTHER: "Other",
};

export const RESIDENCY_STATUS_LABELS: Record<ResidencyStatus, string> = {
  RESIDENT: "Resident",
  NON_RESIDENT: "Non-Resident",
};

export const COURIER_AGENCY_LABELS: Record<CourierAgency, string> = {
  INDIA_POST: "India Post",
  DTDC: "DTDC",
  TRACKON: "Trackon",
  BY_HAND: "By Hand",
  OTHER: "Other",
};

export const QUERY_STATUS_LABELS: Record<QueryStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
