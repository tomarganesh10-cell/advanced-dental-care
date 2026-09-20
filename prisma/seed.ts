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

  // ---------------------------------------------------------------- inventory
  console.log("  Inventory…");

  const inventoryCategories = [
    { name: "Implants & Biomaterials", slug: "implants", position: 1 },
    { name: "Restorative", slug: "restorative", position: 2 },
    { name: "Endodontics", slug: "endodontics", position: 3 },
    { name: "Anaesthetics & Medicines", slug: "anaesthetics", position: 4 },
    { name: "Infection Control & PPE", slug: "ppe", position: 5 },
    { name: "Impression & Lab", slug: "lab", position: 6 },
  ];

  const categoryByslug = new Map<string, string>();
  for (const category of inventoryCategories) {
    const record = await prisma.inventoryCategory.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, position: category.position },
    });
    categoryByslug.set(category.slug, record.id);
  }

  const suppliers = [
    { code: "SUP-IMPLANT", name: "Demo Implant Distributors (DEMO)", city: "New Delhi" },
    { code: "SUP-DENTAL", name: "Demo Dental Supplies (DEMO)", city: "Chandigarh" },
    { code: "SUP-PHARMA", name: "Demo Pharma Agencies (DEMO)", city: "Mohali" },
  ];

  const supplierByCode = new Map<string, string>();
  for (const supplier of suppliers) {
    const record = await prisma.supplier.upsert({
      where: { code: supplier.code },
      create: {
        code: supplier.code,
        name: supplier.name,
        address: supplier.city,
        contactName: "Demo Contact",
      },
      update: {},
    });
    supplierByCode.set(supplier.code, record.id);
  }

  /**
   * Realistic consumables for a practice doing implants and general dentistry.
   * Quantities are chosen so the stock screen shows every state on first load:
   * healthy, at the reorder level, out of stock, expiring soon, and expired.
   */
  const stockSeeds: Array<{
    sku: string;
    name: string;
    category: string;
    supplier: string;
    unit: string;
    brand?: string;
    reorderLevel: number;
    reorderQuantity: number;
    batchTracked: boolean;
    expiryTracked: boolean;
    storageLocation: string;
    batches: Array<{ qty: number; expiryDays: number | null; costPaise?: number }>;
  }> = [
    {
      sku: "ADC-I-0001",
      name: "Titanium implant 4.1 × 10 mm",
      category: "implants",
      supplier: "SUP-IMPLANT",
      unit: "PIECE",
      brand: "Demo Implant System",
      reorderLevel: 6,
      reorderQuantity: 12,
      batchTracked: true,
      expiryTracked: true,
      storageLocation: "Implant cabinet, drawer 1",
      batches: [
        { qty: 9, expiryDays: 540, costPaise: 850_000 },
        { qty: 4, expiryDays: 120, costPaise: 850_000 },
      ],
    },
    {
      sku: "ADC-I-0002",
      name: "Bone graft granules 0.5 g",
      category: "implants",
      supplier: "SUP-IMPLANT",
      unit: "VIAL",
      reorderLevel: 4,
      reorderQuantity: 10,
      batchTracked: true,
      expiryTracked: true,
      storageLocation: "Implant cabinet, drawer 2",
      // At the reorder level exactly — shows the boundary case.
      batches: [{ qty: 4, expiryDays: 200, costPaise: 420_000 }],
    },
    {
      sku: "ADC-I-0003",
      name: "Collagen membrane 15 × 20 mm",
      category: "implants",
      supplier: "SUP-IMPLANT",
      unit: "PIECE",
      reorderLevel: 3,
      reorderQuantity: 6,
      batchTracked: true,
      expiryTracked: true,
      storageLocation: "Implant cabinet, drawer 2",
      // Out of stock.
      batches: [],
    },
    {
      sku: "ADC-R-0010",
      name: "Composite resin A2 shade",
      category: "restorative",
      supplier: "SUP-DENTAL",
      unit: "SYRINGE",
      reorderLevel: 5,
      reorderQuantity: 15,
      batchTracked: true,
      expiryTracked: true,
      storageLocation: "Surgery 1, wall unit",
      batches: [
        { qty: 12, expiryDays: 400, costPaise: 95_000 },
        // Inside the 60-day warning window.
        { qty: 3, expiryDays: 35, costPaise: 95_000 },
      ],
    },
    {
      sku: "ADC-R-0011",
      name: "Glass ionomer cement",
      category: "restorative",
      supplier: "SUP-DENTAL",
      unit: "PACK",
      reorderLevel: 2,
      reorderQuantity: 6,
      batchTracked: false,
      expiryTracked: true,
      storageLocation: "Surgery 1, wall unit",
      batches: [{ qty: 7, expiryDays: 300, costPaise: 68_000 }],
    },
    {
      sku: "ADC-E-0020",
      name: "Rotary NiTi file assortment",
      category: "endodontics",
      supplier: "SUP-DENTAL",
      unit: "PACK",
      reorderLevel: 3,
      reorderQuantity: 8,
      batchTracked: false,
      expiryTracked: false,
      storageLocation: "Sterilisation room, shelf B2",
      batches: [{ qty: 11, expiryDays: null, costPaise: 210_000 }],
    },
    {
      sku: "ADC-A-0030",
      name: "Lignocaine 2% with adrenaline",
      category: "anaesthetics",
      supplier: "SUP-PHARMA",
      unit: "CARTRIDGE",
      reorderLevel: 50,
      reorderQuantity: 200,
      batchTracked: true,
      expiryTracked: true,
      storageLocation: "Medicine cupboard (locked)",
      batches: [
        { qty: 180, expiryDays: 260, costPaise: 3_500 },
        // Already expired — the stock screen surfaces this for write-off.
        { qty: 20, expiryDays: -14, costPaise: 3_500 },
      ],
    },
    {
      sku: "ADC-P-0040",
      name: "Nitrile examination gloves (medium)",
      category: "ppe",
      supplier: "SUP-DENTAL",
      unit: "BOX",
      reorderLevel: 8,
      reorderQuantity: 24,
      batchTracked: false,
      expiryTracked: false,
      storageLocation: "Store room, rack A",
      batches: [{ qty: 22, expiryDays: null, costPaise: 45_000 }],
    },
    {
      sku: "ADC-P-0041",
      name: "Surgical face masks (3-ply)",
      category: "ppe",
      supplier: "SUP-DENTAL",
      unit: "BOX",
      reorderLevel: 6,
      reorderQuantity: 20,
      batchTracked: false,
      expiryTracked: false,
      storageLocation: "Store room, rack A",
      // Below the reorder level.
      batches: [{ qty: 3, expiryDays: null, costPaise: 22_000 }],
    },
    {
      sku: "ADC-L-0050",
      name: "Addition silicone impression material",
      category: "lab",
      supplier: "SUP-DENTAL",
      unit: "PACK",
      reorderLevel: 3,
      reorderQuantity: 8,
      batchTracked: true,
      expiryTracked: true,
      storageLocation: "Surgery 2, cupboard",
      batches: [{ qty: 6, expiryDays: 150, costPaise: 135_000 }],
    },
  ];

  /** Deterministic so re-seeding does not renumber every label. */
  let labelSequence = 0;
  const nextLabelCode = () => {
    labelSequence += 1;
    return `ADC-B-SEED${String(labelSequence).padStart(2, "0")}`;
  };

  for (const seed of stockSeeds) {
    const item = await prisma.inventoryItem.upsert({
      where: { sku: seed.sku },
      create: {
        sku: seed.sku,
        name: seed.name,
        brand: seed.brand ?? null,
        categoryId: categoryByslug.get(seed.category)!,
        supplierId: supplierByCode.get(seed.supplier)!,
        unit: seed.unit as never,
        reorderLevel: seed.reorderLevel,
        reorderQuantity: seed.reorderQuantity,
        requiresBatchTracking: seed.batchTracked,
        requiresExpiryTracking: seed.expiryTracked,
        storageLocation: seed.storageLocation,
      },
      update: {},
    });

    for (const [index, batch] of seed.batches.entries()) {
      const labelCode = nextLabelCode();

      const existing = await prisma.inventoryBatch.findUnique({ where: { labelCode } });
      if (existing) continue;

      const created = await prisma.inventoryBatch.create({
        data: {
          itemId: item.id,
          labelCode,
          batchNumber: seed.batchTracked ? `LOT-${seed.sku.slice(-4)}-${index + 1}` : null,
          expiryDate: batch.expiryDays === null ? null : atClinicTime(batch.expiryDays, "12:00"),
          supplierId: supplierByCode.get(seed.supplier)!,
          invoiceRef: `DEMO-INV-${seed.sku.slice(-4)}`,
          quantityReceived: batch.qty,
          quantityRemaining: batch.qty,
          unitCostPaise: batch.costPaise ?? null,
          receivedAt: atClinicTime(-30 + index * 5, "10:00"),
        },
      });

      // Every batch gets the RECEIPT movement that explains its balance, so the
      // seeded data satisfies the same ledger invariant the application does.
      await prisma.stockMovement.create({
        data: {
          itemId: item.id,
          batchId: created.id,
          type: "RECEIPT",
          quantity: batch.qty,
          balanceAfter: batch.qty,
          notes: "Opening stock (seed)",
          createdAt: created.receivedAt,
        },
      });
    }
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
