import { CalendarClock } from "lucide-react";
import type { OpeningHours } from "@data/clinic-master-data";
import type { VerifiedClaim } from "@data/verification";
import { isPublishable } from "@data/verification";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "19:00" → "7:00 pm" */
function formatTime(hhmm: string): string {
  const [hourPart, minutePart] = hhmm.split(":");
  const hour = Number.parseInt(hourPart ?? "0", 10);
  const minute = minutePart ?? "00";
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

/**
 * Collapses consecutive days with identical hours into a range, so the list
 * reads "Mon – Sat" rather than six identical lines.
 */
interface HoursGroup {
  label: string;
  hours: string;
}

function groupHours(hours: OpeningHours[]): HoursGroup[] {
  // Monday-first ordering reads more naturally than Sunday-first here.
  const ordered = [...hours].sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7));

  const groups: HoursGroup[] = [];
  let runStart: OpeningHours | null = null;
  let runEnd: OpeningHours | null = null;

  const flush = () => {
    if (!runStart || !runEnd) return;
    const label =
      runStart.dayOfWeek === runEnd.dayOfWeek
        ? DAY_NAMES[runStart.dayOfWeek]!
        : `${SHORT_DAY_NAMES[runStart.dayOfWeek]} – ${SHORT_DAY_NAMES[runEnd.dayOfWeek]}`;
    const value =
      runStart.opens && runStart.closes
        ? `${formatTime(runStart.opens)} – ${formatTime(runStart.closes)}`
        : "Closed";
    groups.push({ label, hours: value });
  };

  for (const day of ordered) {
    if (runStart && runEnd && runStart.opens === day.opens && runStart.closes === day.closes) {
      runEnd = day;
      continue;
    }
    flush();
    runStart = day;
    runEnd = day;
  }
  flush();

  return groups;
}

export interface OpeningHoursListProps {
  claim: VerifiedClaim<OpeningHours[]>;
  tone?: "light" | "dark";
  className?: string;
}

/**
 * Renders clinic hours from the master data claim.
 *
 * When the claim is unverified this still renders — hours are operational
 * information a patient needs, and the alternative (showing nothing) sends them
 * to a closed clinic. It carries a visible "please confirm by phone" note
 * instead, which is the honest handling of information we have not re-checked.
 */
export function OpeningHoursList({ claim, tone = "light", className }: OpeningHoursListProps) {
  const groups = groupHours(claim.value);
  const verified = isPublishable(claim);

  return (
    <div className={className}>
      <dl className="space-y-1.5 text-sm">
        {groups.map((group) => (
          <div key={group.label} className="flex items-baseline justify-between gap-4">
            <dt className={cn(tone === "dark" ? "text-[--color-navy-300]" : "text-[--color-ink-muted]")}>
              {group.label}
            </dt>
            <dd
              className={cn(
                "text-right font-medium tabular-nums",
                tone === "dark" ? "text-white" : "text-[--color-ink]",
                group.hours === "Closed" && "font-normal opacity-70",
              )}
            >
              {group.hours}
            </dd>
          </div>
        ))}
      </dl>

      {!verified ? (
        <p
          className={cn(
            "mt-3 flex items-start gap-1.5 text-xs",
            tone === "dark" ? "text-[--color-navy-400]" : "text-[--color-ink-subtle]",
          )}
        >
          <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Please call to confirm hours before travelling.
        </p>
      ) : null}
    </div>
  );
}

/** Whether the clinic is open right now, for the "Open now" pill in the header. */
export function isOpenNow(hours: OpeningHours[], now: Date, timeZone = "Asia/Kolkata"): boolean {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  const dayIndex = SHORT_DAY_NAMES.indexOf(weekday);
  const today = hours.find((h) => h.dayOfWeek === dayIndex);
  if (!today?.opens || !today.closes) return false;

  const current = `${hour}:${minute}`;
  return current >= today.opens && current < today.closes;
}
