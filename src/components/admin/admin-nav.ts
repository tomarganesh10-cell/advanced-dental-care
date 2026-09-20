import { PERMISSIONS, type Permission } from "@/lib/rbac";

/**
 * Admin navigation.
 *
 * Each item declares the permission it needs. The sidebar renders only what the
 * signed-in person can actually reach, so a receptionist does not see a
 * "Patient records" link that will refuse them — a navigation item you cannot
 * use is a support call waiting to happen, and it also tells people what exists
 * that they are not supposed to see.
 *
 * This is presentation only. The permission is enforced again in the page
 * itself; hiding a link is not access control.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  /** Shown as a small count badge, resolved by the layout. */
  badgeKey?: "todayAppointments" | "newLeads" | "pendingConfirmations" | "followUps" | "lowStock";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Today",
    items: [
      { href: "/admin", label: "Overview", icon: "LayoutDashboard" },
      {
        href: "/admin/front-desk",
        label: "Front desk",
        icon: "ConciergeBell",
        permission: PERMISSIONS.APPOINTMENT_CHECK_IN,
        badgeKey: "todayAppointments",
      },
      {
        href: "/admin/calendar",
        label: "Calendar",
        icon: "CalendarDays",
        permission: PERMISSIONS.APPOINTMENT_VIEW,
      },
      {
        href: "/admin/appointments",
        label: "Appointments",
        icon: "CalendarCheck",
        permission: PERMISSIONS.APPOINTMENT_VIEW,
        badgeKey: "pendingConfirmations",
      },
    ],
  },
  {
    label: "Patients",
    items: [
      {
        href: "/admin/patients",
        label: "Patients",
        icon: "Users",
        permission: PERMISSIONS.PATIENT_VIEW,
      },
      {
        href: "/admin/clinical",
        label: "Clinical records",
        icon: "Stethoscope",
        permission: PERMISSIONS.CLINICAL_VIEW,
      },
      {
        href: "/admin/documents",
        label: "Documents",
        icon: "FileImage",
        permission: PERMISSIONS.DOCUMENT_VIEW,
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        href: "/admin/leads",
        label: "Leads",
        icon: "Target",
        permission: PERMISSIONS.LEAD_VIEW,
        badgeKey: "newLeads",
      },
      {
        href: "/admin/international",
        label: "International",
        icon: "Globe2",
        permission: PERMISSIONS.LEAD_VIEW,
      },
      {
        href: "/admin/feedback",
        label: "Feedback",
        icon: "MessageSquareHeart",
        permission: PERMISSIONS.FEEDBACK_VIEW,
      },
    ],
  },
  {
    label: "Stock",
    items: [
      {
        href: "/admin/inventory",
        label: "Inventory",
        icon: "Package",
        permission: PERMISSIONS.INVENTORY_VIEW,
        badgeKey: "lowStock",
      },
      {
        href: "/admin/inventory/expiry",
        label: "Expiry",
        icon: "CalendarClock",
        permission: PERMISSIONS.INVENTORY_VIEW,
      },
      {
        href: "/admin/inventory/labels",
        label: "Print labels",
        icon: "Barcode",
        permission: PERMISSIONS.INVENTORY_LABEL,
      },
      {
        href: "/admin/inventory/counts",
        label: "Stock counts",
        icon: "ClipboardCheck",
        permission: PERMISSIONS.INVENTORY_COUNT,
      },
      {
        href: "/admin/inventory/suppliers",
        label: "Suppliers",
        icon: "Truck",
        permission: PERMISSIONS.SUPPLIER_VIEW,
      },
    ],
  },
  {
    label: "Money",
    items: [
      {
        href: "/admin/invoices",
        label: "Invoices",
        icon: "ReceiptText",
        permission: PERMISSIONS.INVOICE_VIEW,
      },
      {
        href: "/admin/payments",
        label: "Payments",
        icon: "IndianRupee",
        permission: PERMISSIONS.PAYMENT_VIEW,
      },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/admin/staff", label: "Staff", icon: "IdCard", permission: PERMISSIONS.STAFF_VIEW },
      {
        href: "/admin/attendance",
        label: "Attendance",
        icon: "Clock",
        permission: PERMISSIONS.ATTENDANCE_SELF,
      },
      {
        href: "/admin/schedules",
        label: "Schedules",
        icon: "CalendarRange",
        permission: PERMISSIONS.SCHEDULE_VIEW,
      },
    ],
  },
  {
    label: "Website",
    items: [
      {
        href: "/admin/content-verification",
        label: "Content verification",
        icon: "BadgeCheck",
        permission: PERMISSIONS.CONTENT_VERIFY_CLAIMS,
      },
      {
        href: "/admin/blog",
        label: "Blog",
        icon: "Newspaper",
        permission: PERMISSIONS.BLOG_MANAGE,
      },
      {
        href: "/admin/gallery",
        label: "Smile gallery",
        icon: "Images",
        permission: PERMISSIONS.GALLERY_MANAGE,
      },
      {
        href: "/admin/testimonials",
        label: "Testimonials",
        icon: "Quote",
        permission: PERMISSIONS.TESTIMONIAL_MANAGE,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/admin/reports",
        label: "Reports",
        icon: "ChartColumn",
        permission: PERMISSIONS.REPORT_VIEW,
      },
      {
        href: "/admin/notifications",
        label: "Messages",
        icon: "Send",
        permission: PERMISSIONS.NOTIFICATION_VIEW,
      },
      {
        href: "/admin/audit",
        label: "Audit log",
        icon: "ScrollText",
        permission: PERMISSIONS.AUDIT_LOG_VIEW,
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: "Settings",
        permission: PERMISSIONS.SETTINGS_VIEW,
      },
    ],
  },
];
