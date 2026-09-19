/**
 * Client-side event tracking.
 *
 * Events go to GA4 when it is configured AND to our own `/api/analytics`
 * endpoint. The second path exists because a meaningful share of visitors block
 * GA, and "which campaign produced bookings" is a question the clinic will
 * actually spend money on the answer to — it should not be answered by a
 * dataset with a systematic hole in it.
 *
 * Nothing here records personal data. Names, phone numbers and treatment
 * choices stay out of the analytics payload; attribution is joined to a lead
 * server-side instead.
 */

declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void;
    dataLayer?: unknown[];
  }
}

export type AnalyticsEventName =
  | "booking_started"
  | "booking_step_completed"
  | "booking_completed"
  | "click_to_call"
  | "whatsapp_click"
  | "directions_click"
  | "treatment_page_view"
  | "form_submitted"
  | "international_enquiry"
  | "review_link_click";

export function trackEvent(name: AnalyticsEventName, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;

  try {
    window.gtag?.("event", name, params);
  } catch {
    // Analytics must never break the page.
  }

  try {
    const payload = JSON.stringify({
      name,
      path: window.location.pathname,
      ...captureAttribution(),
      metadata: params,
    });

    // sendBeacon survives the page unloading, which a fetch on a click that
    // navigates away usually does not.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // Ditto.
  }
}

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  landingPage?: string;
  referrer?: string;
}

const STORAGE_KEY = "adcc_attribution";

/**
 * Captures first-touch attribution and keeps it for the session.
 *
 * First touch, not last: if someone arrives from a Google ad, reads for a week,
 * then returns by typing the URL, the ad is what produced the booking.
 */
export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return {};

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Attribution;

    const params = new URLSearchParams(window.location.search);
    const attribution: Attribution = {
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      utmContent: params.get("utm_content") ?? undefined,
      utmTerm: params.get("utm_term") ?? undefined,
      gclid: params.get("gclid") ?? undefined,
      landingPage: window.location.pathname,
      referrer: document.referrer || undefined,
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    // Private browsing can throw on sessionStorage. Attribution is a
    // nice-to-have; the booking must still work.
    return {};
  }
}
