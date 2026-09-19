import { testDb } from "./setup";

/**
 * Test data factories.
 *
 * Deliberately explicit rather than clever: a test that reads
 * `createAppointment({ status: "CONFIRMED" })` tells you what it is testing,
 * and a factory with too much magic hides the thing that actually matters.
 */

let sequence = 0;
const next = () => (sequence += 1).toString().padStart(4, "0");

export async function createStaff(
  options: { role?: string; fullName?: string; isDoctor?: boolean } = {},
) {
  const id = next();
  const user = await testDb.user.create({
    data: {
      type: "STAFF",
      email: `staff-${id}@test.local`,
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$test$test",
    },
  });

  const staff = await testDb.staff.create({
    data: {
      userId: user.id,
      staffCode: `TEST-S-${id}`,
      fullName: options.fullName ?? `Test Staff ${id}`,
      role: (options.role ?? "RECEPTIONIST") as never,
      email: user.email,
    },
  });

  return { user, staff };
}

export async function createDoctor(
  options: { slotMinutes?: number; capacity?: number; schedule?: boolean } = {},
) {
  const id = next();
  const { staff } = await createStaff({ role: "DOCTOR", isDoctor: true });

  const doctor = await testDb.doctor.create({
    data: {
      staffId: staff.id,
      slug: `test-doctor-${id}`,
      displayName: `Dr Test ${id}`,
      qualifications: [],
      specialties: ["General"],
      specialInterests: [],
      isBookable: true,
      isPubliclyListed: true,
      defaultSlotMinutes: options.slotMinutes ?? 30,
    },
  });

  if (options.schedule !== false) {
    // Every day of the week, 10:00–19:00 clinic-local, so tests do not have to
    // care which weekday "tomorrow" lands on.
    await testDb.doctorSchedule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        doctorId: doctor.id,
        dayOfWeek,
        startTime: "10:00",
        endTime: "19:00",
        slotMinutes: options.slotMinutes ?? 30,
        capacity: options.capacity ?? 1,
        isActive: true,
        serviceSlugs: [],
      })),
    });
  }

  return doctor;
}

export async function createPatient(
  options: { fullName?: string; phone?: string; email?: string | null; withUser?: boolean } = {},
) {
  const id = next();

  const user = options.withUser
    ? await testDb.user.create({
        data: { type: "PATIENT", phone: options.phone ?? `+9190000${id}0` },
      })
    : null;

  return testDb.patient.create({
    data: {
      patientNumber: `TEST-P-${id}`,
      fullName: options.fullName ?? `Test Patient ${id}`,
      phone: options.phone ?? `+9190000${id}0`,
      email: options.email === undefined ? `patient-${id}@test.local` : options.email,
      userId: user?.id ?? null,
    },
  });
}

/** A UTC instant at a given clinic-local time, n days from now. */
export function clinicInstant(dayOffset: number, timeHHmm: string): Date {
  const [hours = 0, minutes = 0] = timeHHmm.split(":").map(Number);
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  // IST is a fixed UTC+5:30 with no DST.
  date.setUTCHours(hours - 5, minutes - 30, 0, 0);
  return date;
}

export async function createAppointment(options: {
  patientId: string;
  doctorId: string;
  startsAt: Date;
  durationMinutes?: number;
  status?: string;
  serviceSlug?: string;
}) {
  const duration = options.durationMinutes ?? 30;

  return testDb.appointment.create({
    data: {
      reference: `TEST-A-${next()}`,
      patientId: options.patientId,
      doctorId: options.doctorId,
      serviceSlug: options.serviceSlug ?? "general-dentistry",
      serviceName: "Test treatment",
      status: (options.status ?? "CONFIRMED") as never,
      channel: "WEBSITE",
      startsAt: options.startsAt,
      endsAt: new Date(options.startsAt.getTime() + duration * 60 * 1000),
      durationMinutes: duration,
      isNewPatient: false,
    },
  });
}

export async function seedNotificationTemplates() {
  const { DEFAULT_TEMPLATES } = await import("@/server/notifications/templates");

  for (const template of DEFAULT_TEMPLATES) {
    await testDb.notificationTemplate.upsert({
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
      },
      update: {},
    });
  }
}
