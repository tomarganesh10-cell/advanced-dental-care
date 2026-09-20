/**
 * Development seed.
 *
 * Creates a working clinic: staff across every role, doctors with schedules,
 * demo patients, appointments in several states, leads, invoices and the
 * notification templates.
 *
 * Two hard rules:
 *  1. It refuses to run against NODE_ENV=production. A seed that can be run
 *     against a live clinic database is a data-loss incident waiting for a
 *     tired evening.
 *  2. Every generated person is obviously fictional and marked DEMO. No real
 *     patient data, ever, not even anonymised — "anonymised" dental records
 *     with real radiographs are not anonymous.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hash } from "@node-rs/argon2";
import { DEFAULT_TEMPLATES } from "../src/server/notifications/templates.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to seed a production database. This script creates demo patients and staff accounts.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!Dev123";

/** Clinic-local time helper: "HH:mm" on a date offset from today. */
function atClinicTime(dayOffset: number, timeHHmm: string): Date {
  const [hours = 0, minutes = 0] = timeHHmm.split(":").map(Number);
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  // IST is UTC+5:30 and has no DST, so the offset is a constant.
  date.setUTCHours(hours - 5, minutes - 30, 0, 0);
  return date;
}

async function main(): Promise<void> {
  console.log("Seeding development data…\n");

  // ---------------------------------------------------------------- templates
  for (const template of DEFAULT_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: {
        key_channel_language: {
          key: template.key,
          channel: template.channel,
          language: template.language,
        },
      },
      create: {
        key: template.key,
        channel: template.channel,
        language: template.language,
        subject: template.subject ?? null,
        body: template.body,
        variables: template.variables,
        description: template.description,
        providerTemplateName: template.providerTemplateName ?? null,
      },
      update: {},
    });
  }
  console.log(`  ✓ ${DEFAULT_TEMPLATES.length} notification templates`);

  // -------------------------------------------------------------------- staff
  const passwordHash = await hash(SEED_PASSWORD, ARGON2_OPTIONS);

  const staffSeeds = [
    {
      code: "ADC-S-0001",
      name: "Dr. Anshu Gupta",
      role: "SUPER_ADMIN" as const,
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
      isDoctor: true,
    },
    {
      code: "ADC-S-0002",
      name: "Dr. Priya Sharma (DEMO)",
      role: "DOCTOR" as const,
      email: "doctor@example.com",
      isDoctor: true,
    },
    {
      code: "ADC-S-0003",
      name: "Neha Verma (DEMO)",
      role: "RECEPTIONIST" as const,
      email: "reception@example.com",
      isDoctor: false,
    },
    {
      code: "ADC-S-0004",
      name: "Rajesh Kumar (DEMO)",
      role: "MANAGER" as const,
      email: "manager@example.com",
      isDoctor: false,
    },
    {
      code: "ADC-S-0005",
      name: "Simran Kaur (DEMO)",
      role: "DENTAL_ASSISTANT" as const,
      email: "assistant@example.com",
      isDoctor: false,
    },
    {
      code: "ADC-S-0006",
      name: "Arjun Mehta (DEMO)",
      role: "MARKETING" as const,
      email: "marketing@example.com",
      isDoctor: false,
    },
    {
      code: "ADC-S-0007",
      name: "Kavita Rao (DEMO)",
      role: "ACCOUNTANT" as const,
      email: "accounts@example.com",
      isDoctor: false,
    },
  ];

  const doctorIds: string[] = [];

  for (const seed of staffSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        type: "STAFF",
        email: seed.email,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      update: { passwordHash },
      select: { id: true },
    });

    const staff = await prisma.staff.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        staffCode: seed.code,
        fullName: seed.name,
        role: seed.role,
        email: seed.email,
        joiningDate: new Date("2024-01-15"),
      },
      update: { fullName: seed.name, role: seed.role },
      select: { id: true },
    });

    if (seed.isDoctor) {
      const slug = seed.name
        .toLowerCase()
        .replace(/\(demo\)/g, "")
        .trim()
        .replace(/[^a-z\s]/g, "")
        .replace(/\s+/g, "-");

      const doctor = await prisma.doctor.upsert({
        where: { staffId: staff.id },
        create: {
          staffId: staff.id,
          slug,
          displayName: seed.name,
          // Deliberately empty: qualifications are a verified claim and must be
          // entered with evidence, not invented by a seed script.
          qualifications: [],
          specialties:
            seed.code === "ADC-S-0001" ? ["Implantology", "Cosmetic Dentistry"] : ["Endodontics"],
          specialInterests:
            seed.code === "ADC-S-0001"
              ? ["Dental implants", "Full-mouth rehabilitation", "Smile design"]
              : ["Root canal treatment", "Microscopic endodontics"],
          isPubliclyListed: seed.code === "ADC-S-0001",
          isBookable: true,
          displayOrder: seed.code === "ADC-S-0001" ? 0 : 1,
          defaultSlotMinutes: 30,
        },
        update: {},
        select: { id: true },
      });

      doctorIds.push(doctor.id);

      // Mon–Sat 10:00–14:00 and 16:00–19:00; Sunday 11:00–16:00.
      // The gap is the lunch break, which the slot engine handles by simply
      // not having a block there.
      const blocks = [
        ...[1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
          { dayOfWeek, startTime: "10:00", endTime: "14:00" },
          { dayOfWeek, startTime: "16:00", endTime: "19:00" },
        ]),
        { dayOfWeek: 0, startTime: "11:00", endTime: "16:00" },
      ];

      const existing = await prisma.doctorSchedule.count({ where: { doctorId: doctor.id } });
      if (existing === 0) {
        await prisma.doctorSchedule.createMany({
          data: blocks.map((block) => ({
            doctorId: doctor.id,
            dayOfWeek: block.dayOfWeek,
            startTime: block.startTime,
            endTime: block.endTime,
            slotMinutes: 30,
            capacity: 1,
            isActive: true,
            serviceSlugs: [],
          })),
        });
      }
    }
  }
  console.log(`  ✓ ${staffSeeds.length} staff accounts (password: ${SEED_PASSWORD})`);

  // ----------------------------------------------------------------- patients
  const patientSeeds = [
    {
      number: "ADC-P-000001",
      name: "Aditya Singh (DEMO)",
      phone: "+919000000001",
      email: "demo1@example.com",
    },
    {
      number: "ADC-P-000002",
      name: "Meera Joshi (DEMO)",
      phone: "+919000000002",
      email: "demo2@example.com",
    },
    { number: "ADC-P-000003", name: "Harpreet Sandhu (DEMO)", phone: "+919000000003", email: null },
    {
      number: "ADC-P-000004",
      name: "James Whitfield (DEMO)",
      phone: "+447700900001",
      email: "demo4@example.com",
      international: true,
      country: "United Kingdom",
    },
    {
      number: "ADC-P-000005",
      name: "Ananya Rao (DEMO)",
      phone: "+919000000005",
      email: "demo5@example.com",
    },
  ];

  const patientIds: string[] = [];

  for (const seed of patientSeeds) {
    const patient = await prisma.patient.upsert({
      where: { patientNumber: seed.number },
      create: {
        patientNumber: seed.number,
        fullName: seed.name,
        phone: seed.phone,
        email: seed.email,
        isInternational: seed.international ?? false,
        countryOfResidence: seed.country ?? null,
        acquisitionSource: "WEBSITE",
        city: seed.international ? null : "Chandigarh",
      },
      update: {},
      select: { id: true },
    });

    patientIds.push(patient.id);

    await prisma.patientConsent.createMany({
      data: [
        {
          patientId: patient.id,
          type: "WHATSAPP_MESSAGING",
          granted: true,
          grantedAt: new Date(),
          method: "PORTAL",
          documentVersion: "booking-form-v1",
        },
        {
          patientId: patient.id,
          type: "DATA_PROCESSING",
          granted: true,
          grantedAt: new Date(),
          method: "IN_PERSON",
          documentVersion: "privacy-v1",
        },
      ],
      skipDuplicates: true,
    });
  }

  // One patient carries a clinical alert, so the flag is visible in the UI.
  if (patientIds[1]) {
    await prisma.patient.update({
      where: { id: patientIds[1] },
      data: { clinicalAlert: "Penicillin allergy — confirm before prescribing" },
    });

    await prisma.medicalHistory.upsert({
      where: { patientId: patientIds[1] },
      create: {
        patientId: patientIds[1],
        allergies: ["Penicillin"],
        currentMedications: ["Metformin 500mg"],
        medicalConditions: ["Type 2 diabetes"],
        isDiabetic: true,
        dentalHistory: "Regular check-ups. Previous RCT on 36 (2022).",
        chiefComplaint: "Sensitivity in upper right quadrant",
        lastReviewedAt: new Date(),
      },
      update: {},
    });
  }

  console.log(`  ✓ ${patientSeeds.length} demo patients`);

  // ------------------------------------------------------------- appointments
  const primaryDoctorId = doctorIds[0];

  if (primaryDoctorId && patientIds.length > 0) {
    const appointmentSeeds = [
      {
        patientIndex: 0,
        dayOffset: 0,
        time: "10:30",
        status: "CONFIRMED" as const,
        service: "dental-implants",
        name: "Dental Implants",
      },
      {
        patientIndex: 1,
        dayOffset: 0,
        time: "11:30",
        status: "CHECKED_IN" as const,
        service: "root-canal",
        name: "Root Canal Treatment",
      },
      {
        patientIndex: 2,
        dayOffset: 0,
        time: "16:30",
        status: "REQUESTED" as const,
        service: "general-dentistry",
        name: "Check-ups, Cleaning & Fillings",
      },
      {
        patientIndex: 3,
        dayOffset: 2,
        time: "10:00",
        status: "CONFIRMED" as const,
        service: "smile-design",
        name: "Smile Design",
      },
      {
        patientIndex: 4,
        dayOffset: -7,
        time: "12:00",
        status: "COMPLETED" as const,
        service: "teeth-whitening",
        name: "Teeth Whitening",
      },
      {
        patientIndex: 0,
        dayOffset: -14,
        time: "17:00",
        status: "NO_SHOW" as const,
        service: "general-dentistry",
        name: "Check-ups, Cleaning & Fillings",
      },
    ];

    for (const [index, seed] of appointmentSeeds.entries()) {
      const patientId = patientIds[seed.patientIndex];
      if (!patientId) continue;

      const reference = `ADC-A-SEED${String(index + 1).padStart(2, "0")}`;
      const startsAt = atClinicTime(seed.dayOffset, seed.time);

      await prisma.appointment.upsert({
        where: { reference },
        create: {
          reference,
          patientId,
          doctorId: primaryDoctorId,
          serviceSlug: seed.service,
          serviceName: seed.name,
          status: seed.status,
          channel: "WEBSITE",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          durationMinutes: 30,
          isNewPatient: seed.patientIndex > 2,
          confirmedAt: seed.status === "REQUESTED" ? null : new Date(),
          checkedInAt: seed.status === "CHECKED_IN" ? new Date() : null,
          completedAt: seed.status === "COMPLETED" ? startsAt : null,
          noShowAt: seed.status === "NO_SHOW" ? startsAt : null,
        },
        update: {},
      });
    }
    console.log(`  ✓ ${appointmentSeeds.length} appointments`);
  }

  // -------------------------------------------------------------------- leads
  const leadSeeds = [
    {
      ref: "ADC-L-SEED01",
      name: "Rohit Bansal (DEMO)",
      phone: "+919000000011",
      treatment: "Dental Implants",
      source: "GOOGLE" as const,
      status: "NEW" as const,
      utm: "google",
    },
    {
      ref: "ADC-L-SEED02",
      name: "Sneha Gupta (DEMO)",
      phone: "+919000000012",
      treatment: "Clear Aligners",
      source: "INSTAGRAM" as const,
      status: "CONTACTED" as const,
      utm: "instagram",
    },
    {
      ref: "ADC-L-SEED03",
      name: "David Miller (DEMO)",
      phone: "+14155550001",
      treatment: "Full-Mouth Rehabilitation",
      source: "INTERNATIONAL" as const,
      status: "QUALIFIED" as const,
      utm: null,
    },
    {
      ref: "ADC-L-SEED04",
      name: "Pooja Nair (DEMO)",
      phone: "+919000000014",
      treatment: "Dental Veneers",
      source: "WEBSITE" as const,
      status: "LOST" as const,
      utm: "google",
    },
  ];

  for (const seed of leadSeeds) {
    await prisma.lead.upsert({
      where: { reference: seed.ref },
      create: {
        reference: seed.ref,
        fullName: seed.name,
        phone: seed.phone,
        treatmentInterest: seed.treatment,
        source: seed.source,
        status: seed.status,
        utmSource: seed.utm,
        utmMedium: seed.utm ? "cpc" : null,
        utmCampaign: seed.utm ? "implants-chandigarh" : null,
        isInternational: seed.source === "INTERNATIONAL",
        nextFollowUpAt: seed.status === "NEW" ? new Date(Date.now() - 3600_000) : null,
        lostReason: seed.status === "LOST" ? "Chose a clinic closer to home" : null,
      },
      update: {},
    });
  }
  console.log(`  ✓ ${leadSeeds.length} leads`);

  // ----------------------------------------------------------------- invoices
  if (patientIds[4]) {
    const existing = await prisma.invoice.findUnique({ where: { number: "ADC-2026-00001" } });

    if (!existing) {
      await prisma.invoice.create({
        data: {
          number: "ADC-2026-00001",
          patientId: patientIds[4],
          status: "ISSUED",
          subtotalPaise: 850000,
          totalPaise: 850000,
          balancePaise: 850000,
          issuedAt: new Date(),
          dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                sequence: 1,
                description: "Professional teeth whitening",
                serviceSlug: "teeth-whitening",
                quantity: 1,
                unitPricePaise: 850000,
                lineTotalPaise: 850000,
              },
            ],
          },
        },
      });
    }
    console.log("  ✓ 1 demo invoice");
  }

  // ----------------------------------------------------------------- settings
  await prisma.setting.upsert({
    where: { key: "patient_number_counter" },
    create: {
      key: "patient_number_counter",
      value: patientSeeds.length,
      description: "Last allocated patient number. Set this to continue existing paper records.",
    },
    update: {},
  });

  console.log("\nSeed complete.\n");
  console.log("  Staff sign-in:   /staff-login");
  console.log(`  Email:           ${process.env.SEED_ADMIN_EMAIL ?? "admin@example.com"}`);
  console.log(`  Password:        ${SEED_PASSWORD}`);
  console.log("\n  Patient sign-in: /patient-login with +91 90000 00001 (dev OTP is logged)\n");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
