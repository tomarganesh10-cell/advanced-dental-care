import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addMinutes, format, parse, startOfDay } from "date-fns";

/**
 * Time handling.
 *
 * The whole application stores UTC and displays Asia/Kolkata. The clinic is in
 * one timezone, but international patients are not, and a booking confirmation
 * that renders in the reader's local time is a missed appointment. Everything
 * user-facing is therefore formatted explicitly in clinic time and labelled.
 *
 * India is UTC+5:30 with no daylight saving, which removes a whole class of
 * bug — but the code still goes through a timezone library rather than adding
 * 330 minutes, so nothing breaks if the clinic ever opens a second location.
 */

export const CLINIC_TIMEZONE = "Asia/Kolkata";

/** "HH:mm" on a given clinic-local date → the corresponding UTC instant. */
export function clinicTimeToUtc(date: Date, timeHHmm: string, timeZone = CLINIC_TIMEZONE): Date {
  const dayString = formatInTimeZone(date, timeZone, "yyyy-MM-dd");
  return fromZonedTime(`${dayString} ${timeHHmm}:00`, timeZone);
}

/** A UTC instant → "HH:mm" in clinic time. */
export function utcToClinicTime(instant: Date, timeZone = CLINIC_TIMEZONE): string {
  return formatInTimeZone(instant, timeZone, "HH:mm");
}

/** Clinic-local calendar date of a UTC instant, as "yyyy-MM-dd". */
export function clinicDateString(instant: Date, timeZone = CLINIC_TIMEZONE): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

/** Clinic-local day-of-week (0 = Sunday) for a UTC instant. */
export function clinicDayOfWeek(instant: Date, timeZone = CLINIC_TIMEZONE): number {
  return toZonedTime(instant, timeZone).getDay();
}

/** Parses "yyyy-MM-dd" as clinic-local midnight, returned as a UTC instant. */
export function clinicDayStart(dateString: string, timeZone = CLINIC_TIMEZONE): Date {
  return fromZonedTime(`${dateString} 00:00:00`, timeZone);
}

export function clinicDayEnd(dateString: string, timeZone = CLINIC_TIMEZONE): Date {
  return fromZonedTime(`${dateString} 23:59:59.999`, timeZone);
}

/** Display helpers. All of these state the timezone where it could matter. */

export function formatClinicDate(instant: Date, pattern = "EEE d MMM yyyy"): string {
  return formatInTimeZone(instant, CLINIC_TIMEZONE, pattern);
}

export function formatClinicTime(instant: Date, pattern = "h:mm a"): string {
  return formatInTimeZone(instant, CLINIC_TIMEZONE, pattern);
}

export function formatClinicDateTime(instant: Date): string {
  return formatInTimeZone(instant, CLINIC_TIMEZONE, "EEE d MMM yyyy, h:mm a");
}

/** For international patients: the same instant in their timezone, labelled. */
export function formatInViewerTimezone(instant: Date, timeZone: string): string {
  return `${formatInTimeZone(instant, timeZone, "EEE d MMM yyyy, h:mm a")} (${timeZone.replace("_", " ")})`;
}

/** "HH:mm" → minutes since midnight. */
export function timeToMinutes(timeHHmm: string): number {
  const [h, m] = timeHHmm.split(":");
  return Number.parseInt(h ?? "0", 10) * 60 + Number.parseInt(m ?? "0", 10);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Inclusive-exclusive overlap test used throughout the booking engine. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export { addMinutes, format, parse, startOfDay, toZonedTime, formatInTimeZone };
