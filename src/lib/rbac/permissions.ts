/**
 * Permission catalogue and role defaults.
 *
 * Design notes:
 *  - Permissions are `resource:action` strings. Checks are exact — there is no
 *    wildcard matching at check time, because a wildcard that accidentally
 *    matches `patient:delete` is the kind of bug that does not announce itself.
 *  - SUPER_ADMIN is the single exception and is handled explicitly in `can()`.
 *  - Role defaults below are the *starting* grant. Per-user exceptions live in
 *    the PermissionGrant table, and an explicit DENY there always wins.
 *
 * The principle applied throughout: a role gets what it needs to do its job and
 * nothing adjacent. A receptionist can book and check in patients but cannot
 * read a clinical note; a doctor can write clinical notes but cannot issue a
 * refund; marketing can see lead volume but never a patient's chart.
 */

export const PERMISSIONS = {
  // --- appointments ---------------------------------------------------
  APPOINTMENT_VIEW: "appointment:view",
  APPOINTMENT_VIEW_ALL: "appointment:view_all",
  APPOINTMENT_CREATE: "appointment:create",
  APPOINTMENT_UPDATE: "appointment:update",
  APPOINTMENT_CONFIRM: "appointment:confirm",
  APPOINTMENT_RESCHEDULE: "appointment:reschedule",
  APPOINTMENT_CANCEL: "appointment:cancel",
  APPOINTMENT_CHECK_IN: "appointment:check_in",
  APPOINTMENT_COMPLETE: "appointment:complete",
  APPOINTMENT_ASSIGN_DOCTOR: "appointment:assign_doctor",

  // --- patients (demographics / contact) --------------------------------
  PATIENT_VIEW: "patient:view",
  PATIENT_CREATE: "patient:create",
  PATIENT_UPDATE: "patient:update",
  PATIENT_DELETE: "patient:delete",
  PATIENT_EXPORT: "patient:export",
  PATIENT_MERGE: "patient:merge",

  // --- clinical records (separate from demographics, deliberately) ------
  CLINICAL_VIEW: "clinical:view",
  CLINICAL_CREATE: "clinical:create",
  CLINICAL_UPDATE: "clinical:update",
  /** Reading another clinician's private notes. Narrow by design. */
  CLINICAL_VIEW_PRIVATE: "clinical:view_private",
  PRESCRIPTION_CREATE: "prescription:create",
  PRESCRIPTION_VIEW: "prescription:view",
  TREATMENT_PLAN_VIEW: "treatment_plan:view",
  TREATMENT_PLAN_MANAGE: "treatment_plan:manage",

  // --- documents --------------------------------------------------------
  DOCUMENT_VIEW: "document:view",
  DOCUMENT_UPLOAD: "document:upload",
  DOCUMENT_DELETE: "document:delete",

  // --- staff ------------------------------------------------------------
  STAFF_VIEW: "staff:view",
  STAFF_CREATE: "staff:create",
  STAFF_UPDATE: "staff:update",
  STAFF_DEACTIVATE: "staff:deactivate",
  STAFF_MANAGE_PERMISSIONS: "staff:manage_permissions",

  // --- attendance -------------------------------------------------------
  ATTENDANCE_SELF: "attendance:self",
  ATTENDANCE_VIEW_ALL: "attendance:view_all",
  ATTENDANCE_ADJUST: "attendance:adjust",
  ATTENDANCE_EXPORT: "attendance:export",
  LEAVE_REQUEST: "leave:request",
  LEAVE_APPROVE: "leave:approve",

  // --- doctors / scheduling --------------------------------------------
  DOCTOR_VIEW: "doctor:view",
  DOCTOR_MANAGE: "doctor:manage",
  SCHEDULE_VIEW: "schedule:view",
  SCHEDULE_MANAGE: "schedule:manage",

  // --- CRM --------------------------------------------------------------
  LEAD_VIEW: "lead:view",
  LEAD_VIEW_ALL: "lead:view_all",
  LEAD_CREATE: "lead:create",
  LEAD_UPDATE: "lead:update",
  LEAD_ASSIGN: "lead:assign",
  LEAD_DELETE: "lead:delete",

  // --- money ------------------------------------------------------------
  INVOICE_VIEW: "invoice:view",
  INVOICE_CREATE: "invoice:create",
  INVOICE_UPDATE: "invoice:update",
  INVOICE_CANCEL: "invoice:cancel",
  PAYMENT_VIEW: "payment:view",
  PAYMENT_RECORD: "payment:record",
  PAYMENT_REFUND: "payment:refund",

  // --- content ----------------------------------------------------------
  CONTENT_VIEW: "content:view",
  CONTENT_EDIT: "content:edit",
  CONTENT_PUBLISH: "content:publish",
  CONTENT_VERIFY_CLAIMS: "content:verify_claims",
  BLOG_MANAGE: "blog:manage",
  GALLERY_MANAGE: "gallery:manage",
  TESTIMONIAL_MANAGE: "testimonial:manage",

  // --- reviews & feedback ----------------------------------------------
  FEEDBACK_VIEW: "feedback:view",
  FEEDBACK_HANDLE: "feedback:handle",

  // --- notifications ----------------------------------------------------
  NOTIFICATION_VIEW: "notification:view",
  NOTIFICATION_TEMPLATE_MANAGE: "notification:template_manage",
  NOTIFICATION_RESEND: "notification:resend",

  // --- reports & analytics ---------------------------------------------
  REPORT_VIEW: "report:view",
  REPORT_FINANCIAL: "report:financial",
  REPORT_EXPORT: "report:export",
  ANALYTICS_VIEW: "analytics:view",

  // --- system -----------------------------------------------------------
  SETTINGS_VIEW: "settings:view",
  SETTINGS_MANAGE: "settings:manage",
  AUDIT_LOG_VIEW: "audit:view",
  INTEGRATION_MANAGE: "integration:manage",
  DATA_REQUEST_HANDLE: "data_request:handle",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export type StaffRoleName =
  | "SUPER_ADMIN"
  | "CLINIC_ADMIN"
  | "DOCTOR"
  | "DENTAL_ASSISTANT"
  | "RECEPTIONIST"
  | "MANAGER"
  | "MARKETING"
  | "ACCOUNTANT"
  | "SUPPORT";

const P = PERMISSIONS;

/** Permissions every logged-in staff member has. */
const BASE_STAFF: Permission[] = [P.ATTENDANCE_SELF, P.LEAVE_REQUEST, P.DOCTOR_VIEW, P.SCHEDULE_VIEW];

export const ROLE_PERMISSIONS: Record<StaffRoleName, Permission[]> = {
  /** Handled specially in can(); listed for completeness and for the UI. */
  SUPER_ADMIN: ALL_PERMISSIONS,

  CLINIC_ADMIN: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL, P.APPOINTMENT_CREATE, P.APPOINTMENT_UPDATE,
    P.APPOINTMENT_CONFIRM, P.APPOINTMENT_RESCHEDULE, P.APPOINTMENT_CANCEL, P.APPOINTMENT_CHECK_IN,
    P.APPOINTMENT_COMPLETE, P.APPOINTMENT_ASSIGN_DOCTOR,
    P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE, P.PATIENT_EXPORT, P.PATIENT_MERGE,
    P.CLINICAL_VIEW, P.PRESCRIPTION_VIEW, P.TREATMENT_PLAN_VIEW, P.TREATMENT_PLAN_MANAGE,
    P.DOCUMENT_VIEW, P.DOCUMENT_UPLOAD,
    P.STAFF_VIEW, P.STAFF_CREATE, P.STAFF_UPDATE, P.STAFF_DEACTIVATE,
    P.ATTENDANCE_VIEW_ALL, P.ATTENDANCE_ADJUST, P.ATTENDANCE_EXPORT, P.LEAVE_APPROVE,
    P.DOCTOR_MANAGE, P.SCHEDULE_MANAGE,
    P.LEAD_VIEW, P.LEAD_VIEW_ALL, P.LEAD_CREATE, P.LEAD_UPDATE, P.LEAD_ASSIGN,
    P.INVOICE_VIEW, P.INVOICE_CREATE, P.INVOICE_UPDATE, P.INVOICE_CANCEL,
    P.PAYMENT_VIEW, P.PAYMENT_RECORD,
    P.CONTENT_VIEW, P.CONTENT_EDIT, P.CONTENT_PUBLISH, P.CONTENT_VERIFY_CLAIMS,
    P.BLOG_MANAGE, P.GALLERY_MANAGE, P.TESTIMONIAL_MANAGE,
    P.FEEDBACK_VIEW, P.FEEDBACK_HANDLE,
    P.NOTIFICATION_VIEW, P.NOTIFICATION_TEMPLATE_MANAGE, P.NOTIFICATION_RESEND,
    P.REPORT_VIEW, P.REPORT_FINANCIAL, P.REPORT_EXPORT, P.ANALYTICS_VIEW,
    P.SETTINGS_VIEW, P.SETTINGS_MANAGE, P.AUDIT_LOG_VIEW, P.DATA_REQUEST_HANDLE,
  ],

  /**
   * A doctor gets full clinical authority and no financial authority.
   * They can see that an invoice exists for a patient (context for the
   * conversation) but cannot create, alter or refund one.
   */
  DOCTOR: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL, P.APPOINTMENT_CREATE, P.APPOINTMENT_UPDATE,
    P.APPOINTMENT_RESCHEDULE, P.APPOINTMENT_COMPLETE, P.APPOINTMENT_CHECK_IN,
    P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE,
    P.CLINICAL_VIEW, P.CLINICAL_CREATE, P.CLINICAL_UPDATE, P.CLINICAL_VIEW_PRIVATE,
    P.PRESCRIPTION_CREATE, P.PRESCRIPTION_VIEW,
    P.TREATMENT_PLAN_VIEW, P.TREATMENT_PLAN_MANAGE,
    P.DOCUMENT_VIEW, P.DOCUMENT_UPLOAD,
    P.INVOICE_VIEW,
    P.GALLERY_MANAGE,
    P.FEEDBACK_VIEW,
    P.REPORT_VIEW,
  ],

  /**
   * Chairside support. Can see the clinical record they are assisting with and
   * upload images taken at the chair, but cannot author a diagnosis, write a
   * prescription, or read another clinician's private notes.
   */
  DENTAL_ASSISTANT: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL, P.APPOINTMENT_CHECK_IN, P.APPOINTMENT_UPDATE,
    P.PATIENT_VIEW,
    P.CLINICAL_VIEW,
    P.TREATMENT_PLAN_VIEW,
    P.DOCUMENT_VIEW, P.DOCUMENT_UPLOAD,
  ],

  /**
   * Front desk. Everything needed to run the day — and no clinical read access.
   * This is the single most important boundary in the matrix: reception handles
   * the most walk-up traffic and has the least need to see a diagnosis.
   */
  RECEPTIONIST: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL, P.APPOINTMENT_CREATE, P.APPOINTMENT_UPDATE,
    P.APPOINTMENT_CONFIRM, P.APPOINTMENT_RESCHEDULE, P.APPOINTMENT_CANCEL,
    P.APPOINTMENT_CHECK_IN, P.APPOINTMENT_ASSIGN_DOCTOR,
    P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE,
    P.TREATMENT_PLAN_VIEW,
    P.LEAD_VIEW, P.LEAD_VIEW_ALL, P.LEAD_CREATE, P.LEAD_UPDATE,
    P.INVOICE_VIEW, P.INVOICE_CREATE,
    P.PAYMENT_VIEW, P.PAYMENT_RECORD,
    P.NOTIFICATION_VIEW, P.NOTIFICATION_RESEND,
    P.FEEDBACK_VIEW,
  ],

  /**
   * Operations oversight. Sees aggregate performance and staff records; does
   * not need, and does not get, the clinical record.
   */
  MANAGER: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL,
    P.PATIENT_VIEW,
    P.STAFF_VIEW, P.STAFF_UPDATE,
    P.ATTENDANCE_VIEW_ALL, P.ATTENDANCE_ADJUST, P.ATTENDANCE_EXPORT, P.LEAVE_APPROVE,
    P.SCHEDULE_MANAGE,
    P.LEAD_VIEW, P.LEAD_VIEW_ALL, P.LEAD_ASSIGN, P.LEAD_UPDATE,
    P.INVOICE_VIEW, P.PAYMENT_VIEW,
    P.FEEDBACK_VIEW, P.FEEDBACK_HANDLE,
    P.NOTIFICATION_VIEW,
    P.REPORT_VIEW, P.REPORT_FINANCIAL, P.REPORT_EXPORT, P.ANALYTICS_VIEW,
    P.CONTENT_VIEW,
  ],

  /**
   * Marketing works the funnel, not the chart. They get leads, campaign
   * attribution and website content — and no patient clinical data at all.
   * Note the absence of PATIENT_VIEW: a lead is a marketing object, a patient
   * is a medical one.
   */
  MARKETING: [
    ...BASE_STAFF,
    P.LEAD_VIEW, P.LEAD_VIEW_ALL, P.LEAD_CREATE, P.LEAD_UPDATE, P.LEAD_ASSIGN,
    P.CONTENT_VIEW, P.CONTENT_EDIT, P.BLOG_MANAGE, P.GALLERY_MANAGE, P.TESTIMONIAL_MANAGE,
    P.FEEDBACK_VIEW,
    P.ANALYTICS_VIEW, P.REPORT_VIEW,
    P.NOTIFICATION_VIEW,
  ],

  ACCOUNTANT: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL,
    P.PATIENT_VIEW,
    P.INVOICE_VIEW, P.INVOICE_CREATE, P.INVOICE_UPDATE, P.INVOICE_CANCEL,
    P.PAYMENT_VIEW, P.PAYMENT_RECORD, P.PAYMENT_REFUND,
    P.REPORT_VIEW, P.REPORT_FINANCIAL, P.REPORT_EXPORT,
  ],

  SUPPORT: [
    ...BASE_STAFF,
    P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_ALL,
    P.PATIENT_VIEW,
    P.LEAD_VIEW, P.LEAD_CREATE, P.LEAD_UPDATE,
    P.NOTIFICATION_VIEW,
    P.FEEDBACK_VIEW,
  ],
};

/** Human-readable role labels for the admin UI. */
export const ROLE_LABELS: Record<StaffRoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  CLINIC_ADMIN: "Clinic Admin",
  DOCTOR: "Doctor",
  DENTAL_ASSISTANT: "Dental Assistant",
  RECEPTIONIST: "Receptionist",
  MANAGER: "Manager",
  MARKETING: "Marketing",
  ACCOUNTANT: "Accountant",
  SUPPORT: "Support",
};

export const ROLE_DESCRIPTIONS: Record<StaffRoleName, string> = {
  SUPER_ADMIN: "Unrestricted access, including permissions and audit logs.",
  CLINIC_ADMIN: "Runs the clinic day to day. Everything except super-admin controls.",
  DOCTOR: "Full clinical record authority. No financial controls.",
  DENTAL_ASSISTANT: "Chairside support. Reads the clinical record, cannot author it.",
  RECEPTIONIST: "Bookings, patients and payments. No clinical record access.",
  MANAGER: "Staff, attendance and performance reporting. No clinical record access.",
  MARKETING: "Leads, campaigns and website content. No patient record access.",
  ACCOUNTANT: "Invoices, payments and refunds. No clinical record access.",
  SUPPORT: "Read-only front-office assistance.",
};
