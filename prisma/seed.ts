import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SERVICE_CATEGORIES = ["Tax", "GST", "PAN", "Demat/MF"];
const DEFAULT_DISPATCH_ITEMS = ["Physical Forms", "Client Documents", "Cheques"];

async function seedMasterData() {
  for (const [i, name] of DEFAULT_SERVICE_CATEGORIES.entries()) {
    await prisma.masterCategory.upsert({
      where: { kind_name: { kind: "SERVICE", name } },
      create: { kind: "SERVICE", name, sortOrder: i },
      update: {},
    });
  }
  for (const [i, name] of DEFAULT_DISPATCH_ITEMS.entries()) {
    await prisma.masterCategory.upsert({
      where: { kind_name: { kind: "DISPATCH_ITEM", name } },
      create: { kind: "DISPATCH_ITEM", name, sortOrder: i },
      update: {},
    });
  }
  await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log("Seeded master categories and app config.");
}

// Only the walk-in rates given at setup time — correction and TAN rates are left unconfigured
// until the office sets them under Settings → Fee Schedule (forms in categories with no rate
// yet simply show no "standard fee" hint, never blocking entry).
const DEFAULT_PAN_WALKIN_RATES: Array<{ applicationType: "NEW" | "CORRECTION"; signedStatus: "SIGNATURE" | "THUMB"; amount: number }> = [
  { applicationType: "NEW", signedStatus: "SIGNATURE", amount: 150 },
  { applicationType: "NEW", signedStatus: "THUMB", amount: 200 },
];

async function seedFeeSchedule() {
  for (const rate of DEFAULT_PAN_WALKIN_RATES) {
    await prisma.feeScheduleDefault.upsert({
      where: { module_applicationType_signedStatus: { module: "PAN", applicationType: rate.applicationType, signedStatus: rate.signedStatus } },
      create: { module: "PAN", applicationType: rate.applicationType, signedStatus: rate.signedStatus, amount: rate.amount },
      update: {},
    });
  }
  console.log("Seeded PAN walk-in fee schedule (New: Signature ₹150 / Thumb ₹200).");
}

async function main() {
  await seedMasterData();
  await seedFeeSchedule();

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@officemanagement.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";
  const passwordHash = await bcrypt.hash(password, 10);

  // Reuse an existing ADMIN row if one exists (e.g. from an earlier mobile-only seed) instead of
  // creating a duplicate — just bring it up to date with the email+password login credentials.
  const existingAdmin = await prisma.staff.findFirst({ where: { role: "ADMIN" } });

  if (existingAdmin) {
    const updated = await prisma.staff.update({
      where: { id: existingAdmin.id },
      data: { email, passwordHash },
    });
    console.log(`Updated existing admin staff id=${updated.id} — email=${email} password=${password}`);
    return;
  }

  const mobile = process.env.SEED_ADMIN_MOBILE ?? `admin-${Date.now()}`;
  const admin = await prisma.staff.create({
    data: {
      fullName: "Office Admin",
      mobile,
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`Created admin staff id=${admin.id} — email=${email} password=${password}`);
  console.log("Log in via POST /api/auth/staff/login with { email, password } and change this password immediately.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
