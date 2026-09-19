import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { Section, SectionHeading } from "@/components/marketing/section";
import { TechnologyGrid } from "@/components/marketing/technology-grid";
import { buildMetadata } from "@/lib/seo";
import { implantSystems } from "@data/clinic-master-data";
import { publicValue } from "@data/verification";

export const metadata: Metadata = buildMetadata({
  title: "Dental Technology at Our Chandigarh Clinic",
  description:
    "3D imaging, digital planning and the equipment we use at Advanced Dental Care Centre, Sector 18-A, Chandigarh — and what each one changes for you.",
  path: "/technology",
});

export default function TechnologyPage() {
  const systems = publicValue(implantSystems);

  return (
    <>
      <Breadcrumbs items={[{ name: "Technology", path: "/technology" }]} />

      <div className="container-page pb-10">
        <h1 className="text-3xl md:text-4xl">Technology</h1>
        <div className="prose-clinic mt-5">
          <p>
            Equipment is worth mentioning when it changes the decision, not as a list of
            brand names. A 3D scan matters because it shows how much bone is actually there
            before an implant is placed, and where the nerve runs. That is a different
            conversation from &ldquo;we have the latest machine&rdquo;.
          </p>
          <p>
            Below is the equipment currently in use. Anything not yet verified against its
            purchase and licensing documents is held back rather than listed.
          </p>
        </div>
      </div>

      <Section tone="muted" className="pt-0">
        <TechnologyGrid showPendingNotice />
      </Section>

      {systems?.length ? (
        <Section>
          <div className="container-page">
            <SectionHeading
              align="left"
              eyebrow="Implant systems"
              title="The implants we place"
              description="Knowing the system used matters — it determines what parts are available if the restoration ever needs servicing, anywhere in the world."
            />
            <ul className="mt-8 flex flex-wrap gap-3">
              {systems.map((system) => (
                <li
                  key={system}
                  className="rounded-full border border-[--color-hairline] bg-white px-5 py-2.5 text-sm font-medium"
                >
                  {system}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      <Section tone="sunken">
        <BookingCta title="Have your case assessed properly" />
      </Section>
    </>
  );
}
