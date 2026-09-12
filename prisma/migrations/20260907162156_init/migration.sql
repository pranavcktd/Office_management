-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'HALF_DAY', 'ABSENT', 'OVERTIME');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('NEW', 'CORRECTION');

-- CreateEnum
CREATE TYPE "SignedStatus" AS ENUM ('SIGNATURE', 'THUMB');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICE', 'AGENT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'ONLINE', 'ADJUSTED', 'OTHER');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('UNDER_ENTRY', 'PUSHED_TO_NSDL', 'ACK_GENERATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('ALREADY_ISSUED', 'DEMOGRAPHIC_FAILED', 'DATA_INCOMPLETE', 'SIGNATURE_PHOTO_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicantCategory" AS ENUM ('INDIVIDUAL', 'FIRM', 'GOVERNMENT', 'PRIVATE_LTD', 'OTHER');

-- CreateEnum
CREATE TYPE "DispatchEntryType" AS ENUM ('INWARD', 'OUTWARD');

-- CreateEnum
CREATE TYPE "DispatchItemType" AS ENUM ('PHYSICAL_FORMS', 'CLIENT_DOCUMENTS', 'CHEQUES', 'OTHER');

-- CreateEnum
CREATE TYPE "CourierAgency" AS ENUM ('INDIA_POST', 'DTDC', 'TRACKON', 'BY_HAND', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('TAX', 'GST', 'PAN', 'DEMAT_MF', 'OTHER');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "staff" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "shift_1_in" TIME,
    "shift_1_out" TIME,
    "shift_2_in" TIME,
    "shift_2_out" TIME,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "override_note" TEXT,
    "overridden_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" SERIAL NOT NULL,
    "agent_name" TEXT NOT NULL,
    "firm_name" TEXT,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pan_applications" (
    "id" SERIAL NOT NULL,
    "application_type" "ApplicationType" NOT NULL,
    "applicant_name" TEXT NOT NULL,
    "father_name" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "aadhaar_encrypted" TEXT,
    "aadhaar_last4" TEXT,
    "existing_pan" TEXT,
    "signed_status" "SignedStatus" NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "agent_id" INTEGER,
    "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_mode" "PaymentMode" NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'UNDER_ENTRY',
    "rejection_reason" "RejectionReason",
    "adjustment_available" BOOLEAN NOT NULL DEFAULT false,
    "adjusted_from_form_id" INTEGER,
    "created_by" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tan_applications" (
    "id" SERIAL NOT NULL,
    "application_type" "ApplicationType" NOT NULL,
    "existing_tan" TEXT,
    "applicant_name" TEXT NOT NULL,
    "applicant_category" "ApplicantCategory" NOT NULL,
    "other_category_detail" TEXT,
    "signatory_name" TEXT,
    "signatory_pan" TEXT,
    "contact_detail" TEXT,
    "source_type" "SourceType" NOT NULL,
    "agent_id" INTEGER,
    "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_mode" "PaymentMode" NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'UNDER_ENTRY',
    "rejection_reason" "RejectionReason",
    "adjustment_available" BOOLEAN NOT NULL DEFAULT false,
    "adjusted_from_form_id" INTEGER,
    "created_by" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_register" (
    "id" SERIAL NOT NULL,
    "entry_type" "DispatchEntryType" NOT NULL,
    "item_type" "DispatchItemType" NOT NULL,
    "consignment_number" TEXT,
    "courier_agency" "CourierAgency",
    "party_details" TEXT NOT NULL,
    "pan_application_id" INTEGER,
    "tan_application_id" INTEGER,
    "handled_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_queries" (
    "id" SERIAL NOT NULL,
    "client_name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "service_type" "ServiceType" NOT NULL,
    "query_text" TEXT NOT NULL,
    "response_text" TEXT,
    "status" "QueryStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_mobile_key" ON "staff"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_staff_id_work_date_key" ON "attendance"("staff_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "pan_applications_adjusted_from_form_id_key" ON "pan_applications"("adjusted_from_form_id");

-- CreateIndex
CREATE UNIQUE INDEX "tan_applications_adjusted_from_form_id_key" ON "tan_applications"("adjusted_from_form_id");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pan_applications" ADD CONSTRAINT "pan_applications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pan_applications" ADD CONSTRAINT "pan_applications_adjusted_from_form_id_fkey" FOREIGN KEY ("adjusted_from_form_id") REFERENCES "pan_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pan_applications" ADD CONSTRAINT "pan_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tan_applications" ADD CONSTRAINT "tan_applications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tan_applications" ADD CONSTRAINT "tan_applications_adjusted_from_form_id_fkey" FOREIGN KEY ("adjusted_from_form_id") REFERENCES "tan_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tan_applications" ADD CONSTRAINT "tan_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_register" ADD CONSTRAINT "dispatch_register_pan_application_id_fkey" FOREIGN KEY ("pan_application_id") REFERENCES "pan_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_register" ADD CONSTRAINT "dispatch_register_tan_application_id_fkey" FOREIGN KEY ("tan_application_id") REFERENCES "tan_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_register" ADD CONSTRAINT "dispatch_register_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_queries" ADD CONSTRAINT "client_queries_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
