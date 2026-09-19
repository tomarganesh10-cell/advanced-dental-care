import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { SlotUnavailableError, ConflictError } from "@/lib/errors";
import { checkSlotBookable, getDayAvailability } from "@/server/booking/availability";
import { bookAppointment, transitionAppointment } from "@/server/booking/service";
import { clinicDateString } from "@/lib/time";
import {
  clinicInstant,
  createAppointment,
  createDoctor,
  createPatient,
  seedNotificationTemplates,
} from "./factories";

/**
 * Booking engine, against a real database.
 *
 * The double-booking test is the reason this file exists. Two patients
 * submitting the same slot at the same moment is not a hypothetical — it is
 * what happens when a clinic posts an offer — and no amount of application-level
 * checking prevents it without the database enforcing serialisation.
 */

describe("booking engine", () => {
  beforeEach(async () => {
    await seedNotificationTemplates();
  });

  describe("availability", () => {
    it("generates slots inside the doctor's schedule", async () => {
      const doctor = await createDoctor({ slotMinutes: 30 });
      const date = clinicDateString(clinicInstant(3, "12:00"));

      const availability = await getDayAvailability({
        date,
        doctorId: doctor.id,
        durationMinutes: 30,
      });

      expect(availability.isClinicClosed).toBe(false);
      expect(availability.slots.length).toBeGreaterThan(0);
      // 10:00–19:00 in 30-minute steps.
      expect(availability.slots[0]?.label).toBe("10:00");
      expect(availability.slots.at(-1)?.label).toBe("18:30");
    });

    it("never offers a slot that would run past closing time", async () => {
      const doctor = await createDoctor({ slotMinutes: 30 });
      const date = clinicDateString(clinicInstant(3, "12:00"));

      // A 60-minute treatment cannot start at 18:30 in a clinic closing at 19:00.
      const availability = await getDayAvailability({
        date,
        doctorId: doctor.id,
        durationMinutes: 60,
      });

      expect(availability.slots.at(-1)?.label).toBe("18:00");
    });

    it("removes slots that are already taken", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const startsAt = clinicInstant(3, "11:00");

      const before = await getDayAvailability({
        date: clinicDateString(startsAt),
        doctorId: doctor.id,
        durationMinutes: 30,
      });

      await createAppointment({ patientId: patient.id, doctorId: doctor.id, startsAt });

      const after = await getDayAvailability({
        date: clinicDateString(startsAt),
        doctorId: doctor.id,
        durationMinutes: 30,
      });

      expect(after.slots.length).toBe(before.slots.length - 1);
      expect(after.slots.map((slot) => slot.label)).not.toContain("11:00");
    });

    /**
     * A cancelled appointment must free its slot. Getting this wrong quietly
     * shrinks the diary every time someone cancels.
     */
    it("frees the slot again when an appointment is cancelled", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const startsAt = clinicInstant(3, "11:00");

      const appointment = await createAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt,
      });

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELLED" },
      });

      const availability = await getDayAvailability({
        date: clinicDateString(startsAt),
        doctorId: doctor.id,
        durationMinutes: 30,
      });

      expect(availability.slots.map((slot) => slot.label)).toContain("11:00");
    });

    it("respects a doctor's time off", async () => {
      const doctor = await createDoctor();
      const startsAt = clinicInstant(3, "11:00");

      await prisma.doctorTimeOff.create({
        data: {
          doctorId: doctor.id,
          startsAt: clinicInstant(3, "10:30"),
          endsAt: clinicInstant(3, "13:00"),
          reason: "Conference",
        },
      });

      const availability = await getDayAvailability({
        date: clinicDateString(startsAt),
        doctorId: doctor.id,
        durationMinutes: 30,
      });

      const labels = availability.slots.map((slot) => slot.label);
      expect(labels).not.toContain("11:00");
      expect(labels).not.toContain("12:30");
      expect(labels).toContain("13:00");
    });

    it("closes the whole day for a clinic holiday", async () => {
      const doctor = await createDoctor();
      const target = clinicInstant(4, "12:00");
      const date = clinicDateString(target);

      await prisma.clinicHoliday.create({
        data: { date: new Date(`${date}T00:00:00.000Z`), name: "Diwali" },
      });

      const availability = await getDayAvailability({ date, doctorId: doctor.id });

      expect(availability.isClinicClosed).toBe(true);
      expect(availability.closureReason).toBe("Diwali");
      expect(availability.slots).toHaveLength(0);
    });

    it("narrows the day for a half-day holiday rather than closing it", async () => {
      const doctor = await createDoctor();
      const target = clinicInstant(4, "12:00");
      const date = clinicDateString(target);

      await prisma.clinicHoliday.create({
        data: {
          date: new Date(`${date}T00:00:00.000Z`),
          name: "Half day",
          opens: "10:00",
          closes: "13:00",
        },
      });

      const availability = await getDayAvailability({
        date,
        doctorId: doctor.id,
        durationMinutes: 30,
      });

      expect(availability.isClinicClosed).toBe(false);
      expect(availability.slots.at(-1)?.label).toBe("12:30");
    });

    it("honours a block's capacity for multiple chairs", async () => {
      const doctor = await createDoctor({ capacity: 2 });
      const patient = await createPatient();
      const startsAt = clinicInstant(3, "11:00");

      await createAppointment({ patientId: patient.id, doctorId: doctor.id, startsAt });

      let availability = await getDayAvailability({
        date: clinicDateString(startsAt),
        doctorId: doctor.id,
        durationMinutes: 30,
      });
      expect(availability.slots.map((slot) => slot.label)).toContain("11:00");

      const second = await createPatient();
      await createAppointment({ patientId: second.id, doctorId: doctor.id, startsAt });

      availability = await getDayAvailability({
        date: clinicDateString(startsAt),
        doctorId: doctor.id,
        durationMinutes: 30,
      });
      expect(availability.slots.map((slot) => slot.label)).not.toContain("11:00");
    });

    it("enforces the minimum lead time for online bookings", async () => {
      const doctor = await createDoctor();
      // 30 minutes from now is inside the two-hour public lead time.
      const soon = new Date(Date.now() + 30 * 60 * 1000);

      const result = await checkSlotBookable({
        doctorId: doctor.id,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + 30 * 60 * 1000),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/two hours/i);
    });

    it("lets staff override the lead time when booking by phone", async () => {
      const doctor = await createDoctor();
      // Far enough ahead to be inside opening hours regardless of the hour the
      // suite runs, but still inside the public lead-time window.
      const startsAt = clinicInstant(0, "23:00");
      void startsAt;

      const soon = new Date(Date.now() + 30 * 60 * 1000);
      const result = await checkSlotBookable({
        doctorId: doctor.id,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + 30 * 60 * 1000),
        ignoreLeadTime: true,
      });

      // Either it passes, or it fails for a reason other than lead time.
      if (!result.ok) expect(result.reason).not.toMatch(/two hours/i);
    });

    it("refuses a time in the past", async () => {
      const doctor = await createDoctor();
      const past = new Date(Date.now() - 60 * 60 * 1000);

      const result = await checkSlotBookable({
        doctorId: doctor.id,
        startsAt: past,
        endsAt: new Date(past.getTime() + 30 * 60 * 1000),
        ignoreLeadTime: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/past/i);
    });
  });

  describe("booking", () => {
    it("creates the appointment, patient, lead and notifications together", async () => {
      const doctor = await createDoctor();
      const startsAt = clinicInstant(3, "11:00");

      const result = await bookAppointment({
        fullName: "Asha Menon",
        phone: "+919812345678",
        email: "asha@test.local",
        isNewPatient: true,
        serviceSlug: "dental-implants",
        doctorId: doctor.id,
        startsAt,
        durationMinutes: 45,
        consents: { whatsapp: true },
      });

      expect(result.reference).toMatch(/^ADC-A-/);
      // A website booking is a request until reception confirms it.
      expect(result.status).toBe("REQUESTED");

      const patient = await prisma.patient.findUnique({ where: { id: result.patientId } });
      expect(patient?.fullName).toBe("Asha Menon");
      expect(patient?.patientNumber).toMatch(/^ADC-P-/);

      const lead = await prisma.lead.findFirst({ where: { patientId: result.patientId } });
      expect(lead?.status).toBe("APPOINTMENT_BOOKED");

      const consent = await prisma.patientConsent.findFirst({
        where: { patientId: result.patientId, type: "WHATSAPP_MESSAGING" },
      });
      expect(consent?.granted).toBe(true);

      const messages = await prisma.notificationMessage.findMany({
        where: { appointmentId: result.appointmentId },
      });
      expect(messages.map((message) => message.channel).sort()).toEqual(["EMAIL", "WHATSAPP"]);
    });

    it("reuses an existing patient matched by phone", async () => {
      const doctor = await createDoctor();
      const existing = await createPatient({ phone: "+919812345679", email: null });

      const result = await bookAppointment({
        fullName: "Someone Else Entirely",
        phone: "+919812345679",
        email: "filled-in@test.local",
        isNewPatient: false,
        serviceSlug: "general-dentistry",
        doctorId: doctor.id,
        startsAt: clinicInstant(3, "12:00"),
        durationMinutes: 30,
      });

      expect(result.patientId).toBe(existing.id);

      const patient = await prisma.patient.findUnique({ where: { id: existing.id } });
      // An email we did not have is filled in…
      expect(patient?.email).toBe("filled-in@test.local");
      // …but a name the clinic may have corrected in person is not overwritten.
      expect(patient?.fullName).toBe(existing.fullName);
    });

    it("rejects a slot that has already been taken", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const startsAt = clinicInstant(3, "14:00");

      await createAppointment({ patientId: patient.id, doctorId: doctor.id, startsAt });

      await expect(
        bookAppointment({
          fullName: "Second Patient",
          phone: "+919812345680",
          isNewPatient: true,
          serviceSlug: "general-dentistry",
          doctorId: doctor.id,
          startsAt,
          durationMinutes: 30,
        }),
      ).rejects.toThrow(SlotUnavailableError);
    });

    /**
     * Catches a double form submission, which is the most common cause of a
     * duplicate — distinct from the slot being full.
     */
    it("rejects the same patient booking two overlapping appointments", async () => {
      const doctor = await createDoctor({ capacity: 5 });
      const startsAt = clinicInstant(3, "15:00");

      await bookAppointment({
        fullName: "Repeat Booker",
        phone: "+919812345681",
        isNewPatient: true,
        serviceSlug: "general-dentistry",
        doctorId: doctor.id,
        startsAt,
        durationMinutes: 30,
      });

      await expect(
        bookAppointment({
          fullName: "Repeat Booker",
          phone: "+919812345681",
          isNewPatient: false,
          serviceSlug: "general-dentistry",
          doctorId: doctor.id,
          startsAt,
          durationMinutes: 30,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects an unknown treatment", async () => {
      const doctor = await createDoctor();

      await expect(
        bookAppointment({
          fullName: "Curious Patient",
          phone: "+919812345682",
          isNewPatient: true,
          serviceSlug: "teeth-replacement-by-magic",
          doctorId: doctor.id,
          startsAt: clinicInstant(3, "16:00"),
          durationMinutes: 30,
        }),
      ).rejects.toThrow(/not one we offer/i);
    });

    /**
     * The headline test. Two bookings for the same slot, submitted at the same
     * moment. Exactly one must win.
     */
    it("prevents a double booking under genuine concurrency", async () => {
      const doctor = await createDoctor({ capacity: 1 });
      const startsAt = clinicInstant(5, "11:00");

      const attempt = (phone: string) =>
        bookAppointment({
          fullName: `Racer ${phone.slice(-4)}`,
          phone,
          isNewPatient: true,
          serviceSlug: "general-dentistry",
          doctorId: doctor.id,
          startsAt,
          durationMinutes: 30,
        });

      const results = await Promise.allSettled([
        attempt("+919800000001"),
        attempt("+919800000002"),
        attempt("+919800000003"),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);

      // And the database agrees — this is the assertion that would catch a
      // regression where the error was thrown after the row was written.
      const booked = await prisma.appointment.count({
        where: { doctorId: doctor.id, startsAt, deletedAt: null },
      });
      expect(booked).toBe(1);
    });
  });

  describe("status transitions", () => {
    it("confirms an appointment and queues the confirmation", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const appointment = await createAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt: clinicInstant(3, "11:00"),
        status: "REQUESTED",
      });

      await transitionAppointment({ appointmentId: appointment.id, to: "CONFIRMED" });

      const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(updated?.status).toBe("CONFIRMED");
      expect(updated?.confirmedAt).toBeTruthy();

      const events = await prisma.appointmentStatusEvent.findMany({
        where: { appointmentId: appointment.id },
      });
      expect(events.some((event) => event.toStatus === "CONFIRMED")).toBe(true);

      const messages = await prisma.notificationMessage.findMany({
        where: { appointmentId: appointment.id, dedupeKey: { startsWith: "confirmed:" } },
      });
      expect(messages.length).toBeGreaterThan(0);
    });

    it("schedules both reminders for a confirmed appointment", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const appointment = await createAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        // Far enough ahead that both the 24h and 2h reminders are still future.
        startsAt: clinicInstant(5, "11:00"),
        status: "REQUESTED",
      });

      await transitionAppointment({ appointmentId: appointment.id, to: "CONFIRMED" });

      const reminders = await prisma.notificationMessage.findMany({
        where: { appointmentId: appointment.id, dedupeKey: { startsWith: "reminder:" } },
      });

      expect(reminders).toHaveLength(2);
      for (const reminder of reminders) {
        expect(reminder.scheduledFor.getTime()).toBeGreaterThan(Date.now());
        expect(reminder.scheduledFor.getTime()).toBeLessThan(appointment.startsAt.getTime());
      }
    });

    it("suppresses queued reminders when an appointment is cancelled", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const appointment = await createAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt: clinicInstant(5, "11:00"),
        status: "REQUESTED",
      });

      await transitionAppointment({ appointmentId: appointment.id, to: "CONFIRMED" });
      await transitionAppointment({
        appointmentId: appointment.id,
        to: "CANCELLED",
        reason: "Patient unwell",
      });

      const reminders = await prisma.notificationMessage.findMany({
        where: { appointmentId: appointment.id, dedupeKey: { startsWith: "reminder:" } },
      });

      expect(reminders.every((reminder) => reminder.status === "SUPPRESSED")).toBe(true);
    });

    it("refuses an invalid transition", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const appointment = await createAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt: clinicInstant(-3, "11:00"),
        status: "COMPLETED",
      });

      await expect(
        transitionAppointment({ appointmentId: appointment.id, to: "CANCELLED" }),
      ).rejects.toThrow(/cannot be marked cancelled/i);
    });

    it("creates a feedback request when an appointment is completed", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const appointment = await createAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt: clinicInstant(0, "10:00"),
        status: "CHECKED_IN",
      });

      await transitionAppointment({ appointmentId: appointment.id, to: "IN_PROGRESS" });
      await transitionAppointment({ appointmentId: appointment.id, to: "COMPLETED" });

      const request = await prisma.reviewRequest.findFirst({
        where: { appointmentId: appointment.id },
      });

      expect(request).toBeTruthy();
      expect(request?.token).toBeTruthy();
      expect(request?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
