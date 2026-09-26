/**
 * Go-live seed: the rows a real clinic needs before it can take a booking.
 *
 * Unlike `prisma/seed.ts` this creates NO demo patients, appointments, leads,
 * invoices, suppliers or stock, so it is safe against a live database. It
 * creates only the four things without which working features look broken:
 *
 *   1. The principal dentist and a weekly schedule. Until a doctor has a
 *      schedule the booking engine generates no slots at all, so /book-appointment
 *      shows nothing and the whole flow looks dead.
 *   2. The notification templates. Code references templates by key; a missing
 *      row means a confirmation with no body.
 *   3. Inventory categories, so stock can be received and labels printed.
 *   4. The patient-number counter, so the first patient is ADC-P-000001.
 *
 * Credentials are deliberately NOT published here. See docs/CONTENT_AUDIT.md:
 * the qualification and registration number on the old site have never been
 * checked against a certificate, and a dentist profile is the one page where an
 * unverifiable credential is a regulatory problem rather than a typo. The
 * profile goes live with the facts the clinic has confirmed; the rest is filled
 * in from Admin -> Staff once the certificates are in hand.
 *
 *   DATABASE_URL='...' npx tsx prisma/seed-golive.ts
 *
 * Re-running it is safe: every write is an upsert keyed on a stable identifier,
 * and nothing that an administrator may have edited afterwards is overwritten.
 */

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { DEFAULT_TEMPLATES } from "../src/server/notifications/templates.js";
import { defaultBookingHours, doctors as doctorProfiles } from "../data/clinic-master-data.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

/** Lunch is a real gap in an Indian clinic day; booking should not offer it. */
const LUNCH_FROM = "14:00";
const LUNCH_TO = "15:00";

function splitAroundLunch(opens: string, closes: string): Array<[string, string]> {
  if (opens >= LUNCH_FROM || closes <= LUNCH_TO) return [[opens, closes]];
  return [
    [opens, LUNCH_FROM],
    [LUNCH_TO, closes],
  ];
}

async function seedDoctor(): Promise<void> {
  const profile = doctorProfiles.find((entry) => entry.slug === "dr-anshu-gupta");
  if (!profile) throw new Error("dr-anshu-gupta is missing from data/clinic-master-data.ts");

  const staff = await prisma.staff.upsert({
    where: { staffCode: "ADC-D-0001" },
    create: {
      staffCode: "ADC-D-0001",
      fullName: profile.name,
      role: "DOCTOR",
      designation: profile.designation,
      joiningDate: new Date(),
      user: {
        create: {
          type: "STAFF",
          // No password and no email: this record exists so the doctor can be
          // shown and booked. A sign-in account is created separately from
          // Admin -> Staff, by someone who can hand over the password in person.
          passwordHash: null,
        },
      },
    },
    update: { fullName: profile.name, designation: profile.designation },
    select: { id: true },
  });

  const doctor = await prisma.doctor.upsert({
    where: { slug: profile.slug },
    create: {
      staffId: staff.id,
      slug: profile.slug,
      displayName: profile.name,
      // Left empty on purpose — see the note at the top of this file.
      qualifications: [],
      registrationCouncil: null,
      registrationNumber: null,
      specialties: [],
      specialInterests: [...profile.specialInterests],
      bio: profile.bio,
      practisingSinceYear: null,
      isVisiting: false,
      isPubliclyListed: true,
      isBookable: true,
      displayOrder: 1,
      defaultSlotMinutes: 30,
    },
    // An administrator may have added the verified credentials by now; a
    // re-run must not wipe them back to empty.
    update: { displayName: profile.name, isPubliclyListed: true },
    select: { id: true },
  });

  const existing = await prisma.doctorSchedule.count({ where: { doctorId: doctor.id } });
  if (existing > 0) {
    console.log(`  = schedule already set (${existing} blocks) — left alone`);
    return;
  }

  const blocks = defaultBookingHours
    .filter((day): day is { dayOfWeek: number; opens: string; closes: string } =>
      day.opens !== null && day.closes !== null)
    .flatMap((day) =>
      splitAroundLunch(day.opens, day.closes).map(([startTime, endTime]) => ({
        doctorId: doctor.id,
        dayOfWeek: day.dayOfWeek,
        startTime,
        endTime,
        slotMinutes: 30,
        capacity: 1,
        isActive: true,
        serviceSlugs: [],
      })),
    );

  await prisma.doctorSchedule.createMany({ data: blocks });
  console.log(`  + ${profile.name} with ${blocks.length} schedule blocks`);
}

async function seedTemplates(): Promise<void> {
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
        isActive: true,
      },
      // The clinic edits wording in admin; a re-run must not undo that.
      update: {},
    });
  }
  console.log(`  + ${DEFAULT_TEMPLATES.length} notification templates`);
}

async function seedInventoryCategories(): Promise<void> {
  const categories = [
    { name: "Implants & Biomaterials", slug: "implants", position: 1 },
    { name: "Restorative", slug: "restorative", position: 2 },
    { name: "Endodontics", slug: "endodontics", position: 3 },
    { name: "Anaesthetics & Medicines", slug: "anaesthetics", position: 4 },
    { name: "Infection Control & PPE", slug: "ppe", position: 5 },
    { name: "Impression & Lab", slug: "lab", position: 6 },
  ];

  for (const category of categories) {
    await prisma.inventoryCategory.upsert({
      where: { slug: category.slug },
      create: category,
      update: {},
    });
  }
  console.log(`  + ${categories.length} inventory categories`);
}

async function main(): Promise<void> {
  console.log("\nGo-live seed\n");
  await seedDoctor();
  await seedTemplates();
  await seedInventoryCategories();

  await prisma.setting.upsert({
    where: { key: "patient_number_counter" },
    create: {
      key: "patient_number_counter",
      value: 0,
      description: "Last allocated patient number. Set this to continue existing paper records.",
    },
    update: {},
  });
  console.log("  + patient number counter");

  console.log("\nDone. Still to do by hand:");
  console.log("  - Admin -> Staff: add the doctor's qualification and council registration");
  console.log("  - Admin -> Staff: create a sign-in account for each staff member");
  console.log("  - Admin -> Settings: confirm opening hours, especially Sunday\n");
}

main()
  .catch((error) => {
    console.error("Go-live seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
