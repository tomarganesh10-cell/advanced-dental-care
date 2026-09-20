// Patient portal smoke check against the running app.
const BASE = process.env.BASE || "http://localhost:3000";

const otp = await fetch(`${BASE}/api/auth/patient-otp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "+919000000001" }),
});
const otpBody = await otp.json();
if (!otpBody.ok) {
  console.error("OTP request failed:", JSON.stringify(otpBody));
  process.exit(1);
}
const code = otpBody.data.devCode;
console.log("OTP issued, masked to", otpBody.data.maskedDestination);

const verify = await fetch(`${BASE}/api/auth/patient-verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "+919000000001", code }),
  redirect: "manual",
});
const verifyBody = await verify.json();
if (!verifyBody.ok) {
  console.error("Verify failed:", JSON.stringify(verifyBody));
  process.exit(1);
}
const cookie = (verify.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("Signed in as patient\n");

let failures = 0;
for (const route of [
  "/patient-dashboard",
  "/patient-dashboard/appointments",
  "/patient-dashboard/treatment-plan",
  "/patient-dashboard/documents",
  "/patient-dashboard/invoices",
]) {
  const res = await fetch(`${BASE}${route}`, { headers: { cookie } });
  const text = await res.text();
  // The patient must never see another patient's name.
  const leaked = ["Meera Joshi", "Harpreet Sandhu", "James Whitfield", "Ananya Rao"].filter((n) =>
    text.includes(n),
  );
  const ok = res.status === 200 && leaked.length === 0;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${String(res.status).padEnd(4)} ${route}${leaked.length ? ` LEAKED: ${leaked.join(", ")}` : ""}`,
  );
}

// A patient must not reach the admin area.
const adminAttempt = await fetch(`${BASE}/admin`, { headers: { cookie }, redirect: "manual" });
const adminText = await adminAttempt.text();
const blocked =
  !adminText.includes("Good morning") &&
  !adminText.includes("Good afternoon") &&
  !adminText.includes("Good evening");
if (!blocked) failures += 1;
console.log(`${blocked ? "ok  " : "FAIL"}      /admin is refused to a patient session`);

console.log(failures === 0 ? "\nPortal checks passed." : `\n${failures} failure(s).`);
process.exit(failures > 0 ? 1 : 0);
