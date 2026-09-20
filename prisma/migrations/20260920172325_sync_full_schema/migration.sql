-- CreateEnum
CREATE TYPE "PanApplicantStatus" AS ENUM ('INDIVIDUAL', 'NON_INDIVIDUAL');

-- CreateEnum
CREATE TYPE "ResidencyStatus" AS ENUM ('RESIDENT', 'NON_RESIDENT');

-- CreateEnum
CREATE TYPE "MasterCategoryKind" AS ENUM ('SERVICE', 'DISPATCH_ITEM');

-- CreateEnum
CREATE TYPE "FormModule" AS ENUM ('PAN', 'TAN');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TrackingLinkModule" AS ENUM ('PAN', 'TAN', 'DISPATCH');

-- AlterEnum
ALTER TYPE "FormStatus" ADD VALUE 'AGENT_DRAFT';

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'AUDITOR';

-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_register" DROP CONSTRAINT "dispatch_register_pan_application_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_register" DROP CONSTRAINT "dispatch_register_tan_application_id_fkey";

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pending_password_expires_at" TIMESTAMP(3),
ADD COLUMN     "pending_password_hash" TEXT;

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "shift_1_in_location" JSONB,
ADD COLUMN     "shift_1_out_location" JSONB,
ADD COLUMN     "shift_2_in_location" JSONB,
ADD COLUMN     "shift_2_out_location" JSONB;

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actor_kind" TEXT NOT NULL DEFAULT 'staff',
ADD COLUMN     "actor_name" TEXT;

-- AlterTable
ALTER TABLE "client_queries" DROP COLUMN "service_type",
ADD COLUMN     "aadhaar_encrypted" TEXT,
ADD COLUMN     "aadhaar_last4" TEXT,
ADD COLUMN     "pan_number" TEXT,
ADD COLUMN     "service_category_id" INTEGER NOT NULL,
ADD COLUMN     "submitted_by_agent" INTEGER,
ADD COLUMN     "tax_year" TEXT;

-- AlterTable
ALTER TABLE "dispatch_register" DROP COLUMN "item_type",
DROP COLUMN "pan_application_id",
DROP COLUMN "tan_application_id",
ADD COLUMN     "courier_details" TEXT,
ADD COLUMN     "courier_other_detail" TEXT,
ADD COLUMN     "item_category_id" INTEGER NOT NULL,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "receipt_path" TEXT;

-- AlterTable
ALTER TABLE "pan_applications" ADD COLUMN     "aadhaar_hash" TEXT,
ADD COLUMN     "ack_number" TEXT,
ADD COLUMN     "adjustment_expired_at" TIMESTAMP(3),
ADD COLUMN     "applicant_status" "PanApplicantStatus" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "auto_backfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cash_received_by" INTEGER,
ADD COLUMN     "form_received_date" DATE,
ADD COLUMN     "guardian_aadhaar_encrypted" TEXT,
ADD COLUMN     "guardian_aadhaar_last4" TEXT,
ADD COLUMN     "historical_import" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "online_payment_detail" TEXT,
ADD COLUMN     "payment_other_detail" TEXT,
ADD COLUMN     "punching_date" DATE,
ADD COLUMN     "rejection_date" DATE,
ADD COLUMN     "rejection_other_detail" TEXT,
ADD COLUMN     "residency_status" "ResidencyStatus" NOT NULL DEFAULT 'RESIDENT',
ADD COLUMN     "standard_fee_amount" DECIMAL(10,2),
ALTER COLUMN "father_name" DROP NOT NULL,
ALTER COLUMN "dob" DROP NOT NULL,
ALTER COLUMN "mobile" DROP NOT NULL;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pending_password_expires_at" TIMESTAMP(3),
ADD COLUMN     "pending_password_hash" TEXT;

-- AlterTable
ALTER TABLE "tan_applications" ADD COLUMN     "ack_number" TEXT,
ADD COLUMN     "adjustment_expired_at" TIMESTAMP(3),
ADD COLUMN     "auto_backfilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cash_received_by" INTEGER,
ADD COLUMN     "dob" DATE,
ADD COLUMN     "form_received_date" DATE,
ADD COLUMN     "historical_import" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "online_payment_detail" TEXT,
ADD COLUMN     "payment_other_detail" TEXT,
ADD COLUMN     "punching_date" DATE,
ADD COLUMN     "rejection_date" DATE,
ADD COLUMN     "rejection_other_detail" TEXT,
ADD COLUMN     "standard_fee_amount" DECIMAL(10,2);

-- DropEnum
DROP TYPE "DispatchItemType";

-- DropEnum
DROP TYPE "ServiceType";

-- CreateTable
CREATE TABLE "staff_ledger_entries" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_notifications" (
    "id" SERIAL NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "agent_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_emails" (
    "id" SERIAL NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "is_login" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_updates" (
    "id" SERIAL NOT NULL,
    "query_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status_at_update" "QueryStatus",
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "principal_kind" TEXT NOT NULL,
    "principal_id" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protean_report_mappings" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "ack_number_header" TEXT NOT NULL,
    "applicant_name_header" TEXT,
    "applicant_last_name_header" TEXT,
    "first_name_header" TEXT,
    "middle_name_header" TEXT,
    "father_last_name_header" TEXT,
    "father_first_name_header" TEXT,
    "father_middle_name_header" TEXT,
    "dob_header" TEXT,
    "email_header" TEXT,
    "mobile_header" TEXT,
    "punching_date_header" TEXT,
    "application_type_header" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" INTEGER,

    CONSTRAINT "protean_report_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_discrepancies" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "application_id" INTEGER NOT NULL,
    "ack_number" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "entered_value" TEXT,
    "report_value" TEXT,
    "staff_id" INTEGER,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" INTEGER,

    CONSTRAINT "import_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_recompute_snapshots" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "application_id" INTEGER NOT NULL,
    "previous_value" DECIMAL(10,2),
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_recompute_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_categories" (
    "id" SERIAL NOT NULL,
    "kind" "MasterCategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "required_query_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "smtp_host" TEXT,
    "smtp_port" INTEGER NOT NULL DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" TEXT,
    "smtp_pass" TEXT,
    "smtp_from" TEXT,
    "day_end_report_time" TEXT,
    "header_notice" TEXT,
    "footer_notice" TEXT,
    "login_notice" TEXT,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" TEXT,
    "maintenance_until" TIMESTAMP(3),
    "maintenance_auto_disable" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_end_report_recipients" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,

    CONSTRAINT "day_end_report_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_path" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedule_defaults" (
    "id" SERIAL NOT NULL,
    "module" "FormModule" NOT NULL,
    "application_type" "ApplicationType" NOT NULL,
    "signed_status" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(10,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_schedule_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_fee_rates" (
    "id" SERIAL NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "module" "FormModule" NOT NULL,
    "application_type" "ApplicationType" NOT NULL,
    "signed_status" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(10,2),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_fee_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_requirements" (
    "id" SERIAL NOT NULL,
    "module" "FormModule" NOT NULL,
    "field_key" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_links" (
    "id" SERIAL NOT NULL,
    "module" "TrackingLinkModule" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_ledger_entries_staff_id_idx" ON "staff_ledger_entries"("staff_id");

-- CreateIndex
CREATE INDEX "agent_notifications_agent_id_idx" ON "agent_notifications"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_emails_email_key" ON "agent_emails"("email");

-- CreateIndex
CREATE INDEX "query_updates_query_id_idx" ON "query_updates"("query_id");

-- CreateIndex
CREATE INDEX "sessions_principal_kind_principal_id_idx" ON "sessions"("principal_kind", "principal_id");

-- CreateIndex
CREATE UNIQUE INDEX "protean_report_mappings_module_key" ON "protean_report_mappings"("module");

-- CreateIndex
CREATE INDEX "import_discrepancies_staff_id_idx" ON "import_discrepancies"("staff_id");

-- CreateIndex
CREATE INDEX "import_discrepancies_module_application_id_idx" ON "import_discrepancies"("module", "application_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_categories_kind_name_key" ON "master_categories"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "day_end_report_recipients_staff_id_key" ON "day_end_report_recipients"("staff_id");

-- CreateIndex
CREATE INDEX "fee_schedule_defaults_module_application_type_signed_status_idx" ON "fee_schedule_defaults"("module", "application_type", "signed_status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedule_defaults_module_application_type_signed_status_key" ON "fee_schedule_defaults"("module", "application_type", "signed_status", "effective_from");

-- CreateIndex
CREATE INDEX "agent_fee_rates_agent_id_module_application_type_signed_sta_idx" ON "agent_fee_rates"("agent_id", "module", "application_type", "signed_status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "agent_fee_rates_agent_id_module_application_type_signed_sta_key" ON "agent_fee_rates"("agent_id", "module", "application_type", "signed_status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "field_requirements_module_field_key_key" ON "field_requirements"("module", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "agents_email_key" ON "agents"("email");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "pan_applications_aadhaar_hash_idx" ON "pan_applications"("aadhaar_hash");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- AddForeignKey
ALTER TABLE "staff_ledger_entries" ADD CONSTRAINT "staff_ledger_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_ledger_entries" ADD CONSTRAINT "staff_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notifications" ADD CONSTRAINT "agent_notifications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_notifications" ADD CONSTRAINT "agent_notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_emails" ADD CONSTRAINT "agent_emails_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pan_applications" ADD CONSTRAINT "pan_applications_cash_received_by_fkey" FOREIGN KEY ("cash_received_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tan_applications" ADD CONSTRAINT "tan_applications_cash_received_by_fkey" FOREIGN KEY ("cash_received_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_register" ADD CONSTRAINT "dispatch_register_item_category_id_fkey" FOREIGN KEY ("item_category_id") REFERENCES "master_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_queries" ADD CONSTRAINT "client_queries_service_category_id_fkey" FOREIGN KEY ("service_category_id") REFERENCES "master_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_queries" ADD CONSTRAINT "client_queries_submitted_by_agent_fkey" FOREIGN KEY ("submitted_by_agent") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_updates" ADD CONSTRAINT "query_updates_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "client_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_updates" ADD CONSTRAINT "query_updates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protean_report_mappings" ADD CONSTRAINT "protean_report_mappings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_discrepancies" ADD CONSTRAINT "import_discrepancies_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_discrepancies" ADD CONSTRAINT "import_discrepancies_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_end_report_recipients" ADD CONSTRAINT "day_end_report_recipients_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_fee_rates" ADD CONSTRAINT "agent_fee_rates_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

