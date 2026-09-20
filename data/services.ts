/**
 * Treatment catalogue. Drives /services, /services/[slug], the booking
 * treatment picker, the CRM treatment-interest field, and the SEO landing pages.
 *
 * Copy rules enforced here (see docs/CONTENT_GOVERNANCE.md):
 *  - describe what the treatment is and what it involves
 *  - never promise an outcome, a duration of result, or a painless experience
 *  - where a figure is quoted (e.g. implant survival) it carries a source
 */

export interface ServiceFaq {
  question: string;
  answer: string;
}

export interface ServiceStep {
  title: string;
  description: string;
}

export interface Service {
  slug: string;
  /** Category slug from SERVICE_CATEGORIES. */
  category: string;
  name: string;
  /** One line, used on cards and in meta descriptions. */
  summary: string;
  /** Long-form body, rendered as paragraphs. */
  body: string[];
  /** Who this is typically for. */
  indications: string[];
  /** What the visit actually involves. */
  steps: ServiceStep[];
  faqs: ServiceFaq[];
  /** Typical number of clinic visits. Stated as a range, never a guarantee. */
  typicalVisits?: string;
  /** Shown in the booking treatment dropdown. */
  bookable: boolean;
  /** Appears in the homepage featured grid. */
  featured?: boolean;
  /** lucide-react icon name. */
  icon: string;
  seo: {
    title: string;
    description: string;
    /** Optional dedicated location landing page, e.g. /dental-implants-chandigarh */
    landingSlug?: string;
  };
}

export interface ServiceCategory {
  slug: string;
  name: string;
  description: string;
  icon: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    slug: "implants",
    name: "Dental Implants",
    description:
      "Replacing missing teeth with titanium implants and implant-supported restorations.",
    icon: "Anchor",
  },
  {
    slug: "cosmetic",
    name: "Cosmetic Dentistry",
    description: "Changing the shape, colour and alignment of teeth.",
    icon: "Sparkles",
  },
  {
    slug: "orthodontics",
    name: "Braces & Aligners",
    description: "Straightening teeth with fixed braces or clear aligners.",
    icon: "AlignHorizontalDistributeCenter",
  },
  {
    slug: "general",
    name: "General Dentistry",
    description: "Check-ups, cleaning, fillings and root canal treatment.",
    icon: "Stethoscope",
  },
  {
    slug: "surgery",
    name: "Oral Surgery",
    description: "Extractions, wisdom teeth and bone grafting procedures.",
    icon: "Scissors",
  },
  {
    slug: "paediatric",
    name: "Children's Dentistry",
    description: "Dental care for children, from first visit onwards.",
    icon: "Baby",
  },
];

export const SERVICES: Service[] = [
  // ---------------------------------------------------------------- implants
  {
    slug: "dental-implants",
    category: "implants",
    name: "Dental Implants",
    summary: "A titanium post placed in the jawbone to support a replacement tooth.",
    body: [
      "A dental implant is a small titanium post placed into the jawbone to take the place of a missing tooth root. Once the bone has healed around it, a crown is attached to the implant so it functions like a single standing tooth.",
      "Implant treatment is planned before it begins. That planning usually includes a clinical examination, a 3D scan to assess the height and width of available bone, and a discussion of what the finished tooth will look like. Not everyone is a candidate — uncontrolled diabetes, heavy smoking, active gum disease and insufficient bone all affect suitability, and the assessment exists to find that out.",
      "Published long-term studies report implant survival at around 90–95% at ten years, though the figure varies with the site, the patient's general health and how well the implant is maintained afterwards. Your own likelihood is something to discuss at the consultation rather than read off a website.",
    ],
    indications: [
      "A single missing tooth where the neighbouring teeth are healthy",
      "Several missing teeth in the same area",
      "A loose denture that could be stabilised",
      "A tooth that cannot be saved and is due for extraction",
    ],
    steps: [
      {
        title: "Consultation and 3D assessment",
        description:
          "Examination, radiographs and, where indicated, a CBCT scan to measure the available bone and locate nerves and sinuses.",
      },
      {
        title: "Treatment plan and written estimate",
        description:
          "You receive the proposed plan, the number of visits, the implant system to be used, and the cost before anything begins.",
      },
      {
        title: "Implant placement",
        description:
          "The implant is placed under local anaesthetic. Most patients return to normal activity the following day, though some swelling and discomfort in the first few days is usual.",
      },
      {
        title: "Healing",
        description:
          "The bone integrates with the implant over roughly three to six months, depending on the site and whether grafting was needed. A temporary tooth can often be worn during this time.",
      },
      {
        title: "Crown fitting",
        description: "An impression or digital scan is taken and the final crown is fitted.",
      },
      {
        title: "Review and maintenance",
        description:
          "Implants need cleaning and periodic review like natural teeth. Peri-implantitis is the main long-term risk and it is largely preventable.",
      },
    ],
    faqs: [
      {
        question: "Is implant surgery painful?",
        answer:
          "The procedure itself is done under local anaesthetic, so you should not feel pain during it. Afterwards, most people describe soreness and swelling for a few days, managed with ordinary painkillers. Tell us if you are anxious about the procedure — that changes how we plan the appointment.",
      },
      {
        question: "How long does the whole process take?",
        answer:
          "Commonly three to six months from placement to final crown, because the bone needs time to integrate with the implant. Cases needing bone grafting take longer. Some situations allow an immediate temporary tooth; whether yours does is a clinical judgement made at the assessment.",
      },
      {
        question: "How long will an implant last?",
        answer:
          "Implants are intended as a long-term restoration, and many last for decades, but nobody can guarantee a lifespan. Outcome depends on oral hygiene, smoking, gum health, general medical conditions and regular maintenance visits.",
      },
      {
        question: "What if I do not have enough bone?",
        answer:
          "Bone grafting or a sinus lift can sometimes create enough bone volume to place an implant. Sometimes a different treatment is the better answer. The 3D scan is what tells us which.",
      },
    ],
    typicalVisits: "3–6 visits over 3–6 months",
    bookable: true,
    featured: true,
    icon: "Anchor",
    seo: {
      title: "Dental Implants in Chandigarh | Advanced Dental Care Centre",
      description:
        "Implant assessment, 3D planning and implant-supported teeth at Advanced Dental Care Centre, Sector 18-A, Chandigarh. Book a consultation.",
      landingSlug: "dental-implants-chandigarh",
    },
  },
  {
    slug: "all-on-4",
    category: "implants",
    name: "Full-Arch Implant Bridge (All-on-4 type)",
    summary: "A fixed set of teeth for a whole jaw, supported on four to six implants.",
    body: [
      "Where all or most of the teeth in a jaw are missing or unsalvageable, a full arch of fixed teeth can be supported on a small number of implants — commonly four, sometimes six. The bridge is screwed onto the implants rather than sitting on the gums, so it does not need adhesive and does not cover the palate.",
      "This is a substantial procedure involving surgery, a period in a provisional bridge, and a final prosthesis. It suits some patients very well and is the wrong answer for others; the assessment decides.",
    ],
    indications: [
      "All teeth missing in one or both jaws",
      "Remaining teeth with a poor long-term prognosis",
      "A lower denture that will not stay in place",
    ],
    steps: [
      { title: "Assessment", description: "Examination, CBCT scan and prosthetic planning." },
      {
        title: "Surgery and provisional bridge",
        description:
          "Any remaining unsalvageable teeth are removed, implants are placed, and a provisional fixed bridge is fitted, often on the same day where the clinical situation allows.",
      },
      {
        title: "Healing period",
        description: "Several months on the provisional bridge while the implants integrate.",
      },
      { title: "Final bridge", description: "The definitive bridge is made and fitted." },
    ],
    faqs: [
      {
        question: "Will I leave with teeth on the day of surgery?",
        answer:
          "Often yes, in the form of a provisional fixed bridge, but this depends on how stable the implants are once placed. It cannot be promised in advance of the surgery.",
      },
      {
        question: "Is it the same as a denture?",
        answer:
          "No. A denture rests on the gums and is removed for cleaning. This bridge is fixed to implants and is removed only by the dentist.",
      },
    ],
    typicalVisits: "5–8 visits over 6–12 months",
    bookable: true,
    icon: "Grid3x3",
    seo: {
      title: "Full-Arch Implant Bridge (All-on-4) in Chandigarh",
      description:
        "Fixed full-arch teeth supported on implants, planned with 3D imaging at Advanced Dental Care Centre, Chandigarh.",
    },
  },
  {
    slug: "bone-grafting",
    category: "implants",
    name: "Bone Grafting & Sinus Lift",
    summary: "Rebuilding bone volume so an implant can be placed where bone has been lost.",
    body: [
      "When a tooth has been missing for a long time, the bone that used to support it shrinks. If there is not enough bone left to hold an implant, grafting can rebuild it. In the upper back jaw, where the sinus sits close to the ridge, a sinus lift raises the sinus floor to create height for an implant.",
      "Grafting adds time to implant treatment — typically several months of healing before the implant can be placed, though in some cases a graft and implant are done together.",
    ],
    indications: [
      "Insufficient bone height or width for an implant",
      "A long-standing gap where the ridge has resorbed",
      "Upper back teeth where the sinus limits available height",
    ],
    steps: [
      {
        title: "3D assessment",
        description: "CBCT measurement of the bone that is actually there.",
      },
      { title: "Grafting procedure", description: "Carried out under local anaesthetic." },
      { title: "Healing", description: "Several months for the graft to consolidate." },
      { title: "Implant placement", description: "Once the graft has matured." },
    ],
    faqs: [
      {
        question: "Where does the graft material come from?",
        answer:
          "Depending on the case it may be your own bone, processed donor or animal-derived material, or a synthetic substitute. We will tell you which is proposed for your case and why.",
      },
    ],
    bookable: true,
    icon: "Layers",
    seo: {
      title: "Bone Grafting & Sinus Lift in Chandigarh",
      description:
        "Bone grafting and sinus lift procedures to make implant treatment possible, at Advanced Dental Care Centre, Chandigarh.",
    },
  },
  // ---------------------------------------------------------------- cosmetic
  {
    slug: "smile-design",
    category: "cosmetic",
    name: "Smile Design",
    summary: "Planning the shape, proportion and colour of front teeth before treatment starts.",
    body: [
      "Smile design is the planning stage of a cosmetic case rather than a treatment in itself. Photographs, measurements and digital mock-ups are used to agree what the finished result should look like before any tooth is prepared.",
      "The plan is then delivered through whichever combination of treatments fits — whitening, bonding, veneers, crowns, orthodontics, or gum recontouring. Seeing a preview first means the conversation about shape and shade happens while it can still be changed.",
    ],
    indications: [
      "Wanting a change to the appearance of front teeth but unsure what is involved",
      "Worn, chipped or uneven front teeth",
      "A combination of colour, shape and alignment concerns",
    ],
    steps: [
      {
        title: "Photographs and records",
        description: "Clinical photographs, scans and measurements.",
      },
      { title: "Digital mock-up", description: "A proposed design you can see and respond to." },
      {
        title: "Trial",
        description:
          "Where appropriate, a temporary trial version is placed over the teeth so you can see the shape in your own mouth before committing.",
      },
      { title: "Definitive treatment", description: "The agreed plan is carried out." },
    ],
    faqs: [
      {
        question: "Will the result look exactly like the mock-up?",
        answer:
          "The mock-up is a close guide, not a photographic guarantee. Tooth colour, gum response and how the teeth meet when you bite all influence the final result.",
      },
      {
        question: "Do I have to have veneers?",
        answer:
          "No. Smile design often concludes that whitening and minor bonding achieve what the patient wants, without removing tooth structure. A plan that preserves more of your own tooth is generally the better plan.",
      },
    ],
    bookable: true,
    featured: true,
    icon: "Sparkles",
    seo: {
      title: "Smile Design in Chandigarh | Advanced Dental Care Centre",
      description:
        "Digital smile planning and cosmetic treatment planning at Advanced Dental Care Centre, Sector 18-A, Chandigarh.",
      landingSlug: "smile-design-chandigarh",
    },
  },
  {
    slug: "veneers",
    category: "cosmetic",
    name: "Dental Veneers",
    summary: "Thin porcelain or composite facings bonded to the front of teeth.",
    body: [
      "A veneer is a thin facing bonded to the front surface of a tooth to change its colour, shape or position. Porcelain veneers are made in a laboratory; composite veneers are built up directly at the chair in a single visit.",
      "Most porcelain veneers require some reduction of the natural tooth surface, and that is irreversible — the tooth will need a veneer or crown from then on. This is worth understanding clearly before starting, which is why veneer cases usually begin with a smile design assessment.",
    ],
    indications: [
      "Discoloured teeth that do not respond to whitening",
      "Chipped, worn or slightly irregular front teeth",
      "Small gaps between front teeth",
    ],
    steps: [
      {
        title: "Assessment and design",
        description: "Photographs, shade selection and a mock-up.",
      },
      {
        title: "Preparation",
        description:
          "Minimal reduction of the tooth surface where required, and an impression or scan.",
      },
      {
        title: "Temporaries",
        description: "Provisional veneers while the laboratory work is made.",
      },
      {
        title: "Fitting",
        description: "The veneers are tried in, checked for shade and fit, and bonded.",
      },
    ],
    faqs: [
      {
        question: "How long do veneers last?",
        answer:
          "Published studies report most porcelain veneers still in service at ten years, but individual results vary widely with bite, grinding habits and oral hygiene. A veneer can chip or debond and may need replacing.",
      },
      {
        question: "Do veneers stain?",
        answer:
          "Porcelain resists staining well. Composite veneers pick up stain more readily over time and may need polishing or replacement sooner.",
      },
    ],
    typicalVisits: "2–3 visits",
    bookable: true,
    icon: "Layers2",
    seo: {
      title: "Dental Veneers in Chandigarh | Advanced Dental Care Centre",
      description:
        "Porcelain and composite veneers, planned with a smile design assessment, in Sector 18-A, Chandigarh.",
      landingSlug: "veneers-chandigarh",
    },
  },
  {
    slug: "teeth-whitening",
    category: "cosmetic",
    name: "Teeth Whitening",
    summary: "Professionally supervised bleaching, in the clinic or with custom home trays.",
    body: [
      "Whitening lightens the natural shade of teeth using a peroxide-based gel, either applied in the clinic or worn at home in custom-made trays. It works on natural tooth structure only — it does not change the colour of crowns, veneers or fillings, which may need replacing afterwards to match.",
      "A check-up comes first. Whitening over untreated decay or active gum disease is not appropriate, and existing sensitivity affects how the treatment is planned.",
    ],
    indications: [
      "General yellowing or darkening of natural teeth with age",
      "Staining from tea, coffee, tobacco or certain foods",
    ],
    steps: [
      {
        title: "Check-up",
        description: "Confirming the teeth and gums are healthy enough to whiten.",
      },
      {
        title: "Shade record",
        description: "The starting shade is recorded so the change can be measured.",
      },
      {
        title: "Treatment",
        description: "In-clinic application or custom trays for home use, as agreed.",
      },
      { title: "Review", description: "Shade check and advice on maintaining the result." },
    ],
    faqs: [
      {
        question: "Will my teeth be sensitive?",
        answer:
          "Temporary sensitivity during and shortly after whitening is common and usually settles within a few days. Tell us if you already have sensitive teeth, as that changes the concentration and regime we would use.",
      },
      {
        question: "How long does it last?",
        answer:
          "Typically one to three years, depending heavily on diet and smoking. Occasional top-up treatment is normal.",
      },
      {
        question: "Are over-the-counter kits the same?",
        answer:
          "No. Products sold directly to the public contain much lower peroxide concentrations, and ill-fitting trays can irritate the gums. Supervised whitening also starts with a check that whitening is appropriate for your teeth at all.",
      },
    ],
    bookable: true,
    icon: "Sun",
    seo: {
      title: "Teeth Whitening in Chandigarh | Advanced Dental Care Centre",
      description: "Professionally supervised teeth whitening in Sector 18-A, Chandigarh.",
    },
  },
  {
    slug: "crowns-bridges",
    category: "cosmetic",
    name: "Crowns & Bridges",
    summary: "Full-coverage restorations for damaged teeth, and fixed replacements for gaps.",
    body: [
      "A crown covers a tooth that is too broken down or too heavily filled to be restored with a filling — commonly after root canal treatment or a large fracture. A bridge replaces a missing tooth by joining to the teeth on either side.",
      "Materials range from all-ceramic to metal-ceramic and zirconia. Which is appropriate depends on where the tooth sits, how hard you bite, and how much the appearance matters at that position.",
    ],
    indications: [
      "A heavily broken-down or cracked tooth",
      "A tooth after root canal treatment",
      "A gap where implant treatment is not suitable or not wanted",
    ],
    steps: [
      {
        title: "Preparation",
        description: "The tooth is shaped and an impression or digital scan is taken.",
      },
      {
        title: "Temporary",
        description: "A provisional crown protects the tooth while the laboratory work is made.",
      },
      {
        title: "Fitting",
        description: "The definitive restoration is tried in, adjusted and cemented.",
      },
    ],
    faqs: [
      {
        question: "Is a bridge better than an implant?",
        answer:
          "Neither is universally better. A bridge involves preparing the adjacent teeth, which is a cost if those teeth are currently healthy. An implant avoids that but needs adequate bone and takes longer. The right answer depends on your specific mouth.",
      },
    ],
    typicalVisits: "2–3 visits",
    bookable: true,
    icon: "Crown",
    seo: {
      title: "Dental Crowns & Bridges in Chandigarh",
      description:
        "Ceramic and zirconia crowns and fixed bridges at Advanced Dental Care Centre, Chandigarh.",
    },
  },
  {
    slug: "full-mouth-rehabilitation",
    category: "cosmetic",
    name: "Full-Mouth Rehabilitation",
    summary: "Rebuilding a worn or collapsed bite across the whole mouth in a planned sequence.",
    body: [
      "Full-mouth rehabilitation is the staged restoration of most or all of the teeth, usually where severe wear, multiple failing restorations or a collapsed bite mean treating teeth one at a time would not work.",
      "These cases are planned from records — photographs, scans, bite registration and often a diagnostic wax-up — before treatment begins, because the sequence matters and changing the bite halfway through is not practical.",
    ],
    indications: [
      "Severe tooth wear from grinding or acid erosion",
      "Multiple failing crowns and fillings",
      "Difficulty chewing because of a collapsed bite",
    ],
    steps: [
      {
        title: "Records and diagnosis",
        description: "Full clinical records, photographs, scans and bite analysis.",
      },
      {
        title: "Diagnostic plan",
        description: "A wax-up or digital plan showing the proposed end point.",
      },
      {
        title: "Staged treatment",
        description: "Treatment carried out in a planned sequence over several months.",
      },
      {
        title: "Maintenance",
        description: "Review, and a night guard where grinding was a contributing cause.",
      },
    ],
    faqs: [
      {
        question: "How long does it take?",
        answer:
          "Typically several months to a year, depending on how many teeth are involved and whether implants or gum treatment are part of the plan.",
      },
    ],
    bookable: true,
    icon: "LayoutGrid",
    seo: {
      title: "Full-Mouth Rehabilitation in Chandigarh",
      description:
        "Planned full-mouth reconstruction for severe wear or multiple failing restorations, Chandigarh.",
    },
  },
  // ------------------------------------------------------------ orthodontics
  {
    slug: "invisalign",
    category: "orthodontics",
    name: "Clear Aligners",
    summary: "Removable transparent trays that move teeth gradually.",
    body: [
      "Clear aligners are a series of removable transparent trays, each worn for one to two weeks, that move teeth in small increments. They are taken out to eat and to clean.",
      "Aligners suit many cases of crowding and spacing well. Some bite corrections are still handled better by fixed braces, and the assessment is what determines which applies to you. Aligners only work while they are in the mouth — the usual requirement is 20–22 hours a day, and results depend on that being met.",
    ],
    indications: [
      "Mild to moderate crowding or spacing",
      "Relapse after previous orthodontic treatment",
      "A preference for a removable, less visible appliance",
    ],
    steps: [
      { title: "Assessment", description: "Examination, radiographs and a digital scan." },
      {
        title: "Digital plan",
        description: "A tooth-movement plan showing the projected sequence.",
      },
      { title: "Aligner wear", description: "Trays changed on schedule, with periodic reviews." },
      { title: "Retention", description: "Retainers afterwards — teeth move back without them." },
    ],
    faqs: [
      {
        question: "How long does treatment take?",
        answer:
          "Commonly six to eighteen months depending on how much movement is needed. Your assessment will give a case-specific estimate.",
      },
      {
        question: "Will I need retainers afterwards?",
        answer:
          "Yes. This applies to all orthodontic treatment. Teeth tend to drift back towards their original position, and retainers are what prevent that. Plan on wearing them indefinitely, at least at night.",
      },
    ],
    bookable: true,
    featured: true,
    icon: "AlignHorizontalDistributeCenter",
    seo: {
      title: "Clear Aligners & Invisalign in Chandigarh",
      description: "Clear aligner treatment assessment and planning in Sector 18-A, Chandigarh.",
      landingSlug: "invisalign-chandigarh",
    },
  },
  {
    slug: "braces",
    category: "orthodontics",
    name: "Braces",
    summary: "Fixed metal or ceramic braces for straightening teeth and correcting the bite.",
    body: [
      "Fixed braces use brackets bonded to the teeth and a wire that applies gentle continuous force. They handle a wider range of movements than aligners, including significant bite correction, and they do not depend on the patient remembering to wear them.",
      "Ceramic brackets are less visible than metal but are more prone to staining around the edges and can be more brittle.",
    ],
    indications: [
      "Crowding, spacing or rotation of teeth",
      "Bite problems — overbite, underbite, crossbite, open bite",
      "Cases where aligner compliance would be difficult",
    ],
    steps: [
      { title: "Assessment", description: "Records, radiographs and treatment planning." },
      { title: "Fitting", description: "Brackets are bonded and the first wire placed." },
      { title: "Adjustments", description: "Reviews every four to eight weeks." },
      { title: "Removal and retention", description: "Braces removed, retainers fitted." },
    ],
    faqs: [
      {
        question: "Do braces hurt?",
        answer:
          "Teeth are usually tender for a few days after fitting and after each adjustment. Ordinary painkillers and soft food help. The soreness settles.",
      },
      {
        question: "Am I too old for braces?",
        answer:
          "No. Adult orthodontic treatment is routine. Healthy gums and bone matter more than age, which is why the assessment includes a gum health check.",
      },
    ],
    bookable: true,
    icon: "Minus",
    seo: {
      title: "Braces & Orthodontic Treatment in Chandigarh",
      description:
        "Fixed braces and orthodontic assessment at Advanced Dental Care Centre, Chandigarh.",
      landingSlug: "orthodontist-chandigarh",
    },
  },
  // ----------------------------------------------------------------- general
  {
    slug: "root-canal",
    category: "general",
    name: "Root Canal Treatment",
    summary: "Removing infected pulp from inside a tooth so the tooth can be kept.",
    body: [
      "Root canal treatment removes infected or inflamed pulp from the inside of a tooth, cleans and shapes the canals, and seals them. It is what allows a tooth with an abscess or irreversible pulp damage to be kept rather than extracted.",
      "It is done under local anaesthetic. The reputation root canals have for pain largely comes from the state the tooth is in beforehand — the treatment is what relieves that. Most teeth need a crown afterwards, because a root-treated tooth is more brittle and prone to fracture.",
    ],
    indications: [
      "Persistent toothache, especially at night or on hot and cold",
      "A dental abscess or facial swelling",
      "Deep decay reaching the nerve",
      "A tooth that has darkened after an injury",
    ],
    steps: [
      { title: "Diagnosis", description: "Examination, vitality testing and radiographs." },
      {
        title: "Access and cleaning",
        description: "The canals are located, cleaned and shaped under anaesthetic.",
      },
      { title: "Sealing", description: "The canals are filled and sealed." },
      {
        title: "Restoration",
        description: "A permanent filling and, in most cases, a crown to protect the tooth.",
      },
    ],
    faqs: [
      {
        question: "Is it painful?",
        answer:
          "The tooth is numbed, so the procedure should not hurt. Some tenderness for a few days afterwards is normal. If you are in pain now, that is a reason to be seen sooner rather than later.",
      },
      {
        question: "Can it be done in one visit?",
        answer:
          "Sometimes. Whether it is single or multi-visit depends on the anatomy of the tooth and whether there is active infection.",
      },
      {
        question: "Why do I need a crown afterwards?",
        answer:
          "A root-treated tooth has lost structure and no longer has an internal blood supply, which makes it more likely to fracture. A crown distributes the biting force and protects against that.",
      },
    ],
    typicalVisits: "1–2 visits, plus a crown appointment",
    bookable: true,
    featured: true,
    icon: "Stethoscope",
    seo: {
      title: "Root Canal Treatment in Chandigarh",
      description:
        "Root canal treatment for infected or painful teeth at Advanced Dental Care Centre, Sector 18-A, Chandigarh.",
      landingSlug: "root-canal-chandigarh",
    },
  },
  {
    slug: "general-dentistry",
    category: "general",
    name: "Check-ups, Cleaning & Fillings",
    summary: "Routine examination, scaling and restoration of decayed teeth.",
    body: [
      "Routine dentistry is the part that prevents the expensive part. A check-up looks at the teeth, gums, bite and soft tissues, including a screening look for anything unusual in the mouth. Scaling removes hardened plaque that brushing cannot.",
      "Where decay is found, a filling restores the tooth. Tooth-coloured composite is used in most situations.",
    ],
    indications: [
      "Routine six-monthly or annual examination",
      "Bleeding gums or bad breath",
      "Sensitivity or a visible cavity",
      "A broken or lost filling",
    ],
    steps: [
      {
        title: "Examination",
        description: "Teeth, gums, bite and soft tissues, with radiographs where indicated.",
      },
      {
        title: "Scaling and polishing",
        description: "Removal of plaque and calculus above and below the gum line.",
      },
      { title: "Restorations", description: "Fillings where decay is present." },
      {
        title: "Prevention advice",
        description: "Technique, interdental cleaning and recall interval.",
      },
    ],
    faqs: [
      {
        question: "How often should I have a check-up?",
        answer:
          "It depends on your risk. Patients with healthy gums and low decay risk may be seen annually; those with gum disease or a history of decay benefit from more frequent visits. We will suggest an interval based on what we find.",
      },
      {
        question: "Does scaling damage or loosen teeth?",
        answer:
          "No. Scaling removes the deposits; if teeth feel different afterwards it is usually because the deposits were masking existing gum recession rather than because cleaning caused it.",
      },
    ],
    bookable: true,
    featured: true,
    icon: "ShieldCheck",
    seo: {
      title: "Dental Check-up, Cleaning & Fillings in Chandigarh",
      description:
        "Routine dental examination, scaling and tooth-coloured fillings in Sector 18-A, Chandigarh.",
    },
  },
  {
    slug: "gum-treatment",
    category: "general",
    name: "Gum Treatment",
    summary: "Treating gum disease before it costs you teeth.",
    body: [
      "Gum disease is the leading cause of tooth loss in adults and is often painless until it is advanced. Treatment starts with a periodontal assessment — measuring the depth of the pockets around each tooth — followed by deep cleaning below the gum line.",
      "Gum treatment only holds if home cleaning changes too. That is not a throwaway line: the professional cleaning resets the situation, and daily interdental cleaning is what keeps it there.",
    ],
    indications: [
      "Bleeding gums when brushing",
      "Persistent bad breath",
      "Loose teeth or receding gums",
      "Before implant or orthodontic treatment",
    ],
    steps: [
      {
        title: "Periodontal assessment",
        description: "Pocket charting and radiographs to measure bone levels.",
      },
      {
        title: "Non-surgical therapy",
        description: "Deep cleaning of the root surfaces, usually over one or more visits.",
      },
      { title: "Review", description: "Re-measurement to see how the gums responded." },
      { title: "Maintenance", description: "A recall interval matched to your risk." },
    ],
    faqs: [
      {
        question: "Can gum disease be cured?",
        answer:
          "Advanced gum disease can be stabilised rather than cured — bone that has already been lost does not grow back on its own. Stopping further loss is a realistic goal, and an important one.",
      },
    ],
    bookable: true,
    icon: "Heart",
    seo: {
      title: "Gum Disease Treatment in Chandigarh",
      description:
        "Periodontal assessment and gum disease treatment at Advanced Dental Care Centre, Chandigarh.",
    },
  },
  // ----------------------------------------------------------------- surgery
  {
    slug: "wisdom-tooth-removal",
    category: "surgery",
    name: "Wisdom Tooth Removal",
    summary: "Assessment and surgical removal of impacted or problematic wisdom teeth.",
    body: [
      "Wisdom teeth are removed when they cause problems — repeated infection around a partly erupted tooth, decay that cannot be restored, damage to the tooth in front, or cysts. Wisdom teeth that are healthy and causing no trouble are generally left alone.",
      "Assessment includes a radiograph, and for lower wisdom teeth a CBCT scan is sometimes needed to see the relationship to the inferior alveolar nerve. That matters: it is the main risk to discuss before surgery.",
    ],
    indications: [
      "Recurrent pain or swelling around a partly erupted wisdom tooth",
      "Decay in the wisdom tooth or the tooth in front of it",
      "A cyst associated with an unerupted tooth",
    ],
    steps: [
      {
        title: "Assessment",
        description: "Radiograph, and CBCT where the nerve relationship needs clarifying.",
      },
      {
        title: "Surgery",
        description: "Removal under local anaesthetic, with sedation where appropriate.",
      },
      {
        title: "Recovery",
        description: "Swelling and limited mouth opening for several days is usual.",
      },
      { title: "Review", description: "Suture removal and healing check where required." },
    ],
    faqs: [
      {
        question: "What are the risks?",
        answer:
          "Swelling, bruising, limited mouth opening and a dry socket are the common ones. For lower wisdom teeth there is a risk of temporary or, uncommonly, permanent altered sensation in the lip and chin because of the nerve running nearby. Your specific risk is assessed from the imaging and explained before you consent.",
      },
      {
        question: "How long is the recovery?",
        answer:
          "Most people take two to three days off normal activity, with swelling peaking around day two and settling over a week.",
      },
    ],
    bookable: true,
    icon: "Scissors",
    seo: {
      title: "Wisdom Tooth Removal in Chandigarh",
      description:
        "Assessment and surgical removal of impacted wisdom teeth in Sector 18-A, Chandigarh.",
      landingSlug: "oral-surgeon-chandigarh",
    },
  },
  {
    slug: "extractions",
    category: "surgery",
    name: "Tooth Extraction",
    summary: "Removing a tooth that cannot be saved, and planning what replaces it.",
    body: [
      "Extraction is the last option, not the first. Where a tooth is unrestorable — split, severely decayed, or with advanced bone loss — removing it relieves the problem and protects the teeth around it.",
      "The conversation about what replaces the tooth is best had before the extraction, not after, because some options (particularly implants) are affected by how the socket is managed on the day.",
    ],
    indications: [
      "A tooth broken below the gum level",
      "Advanced gum disease with mobility",
      "A failed root canal that cannot be retreated",
      "Crowding, as part of an orthodontic plan",
    ],
    steps: [
      {
        title: "Assessment",
        description: "Radiograph and discussion of alternatives to extraction.",
      },
      {
        title: "Extraction",
        description:
          "Under local anaesthetic, with socket preservation where an implant is planned.",
      },
      {
        title: "Aftercare",
        description: "Written post-operative instructions and a point of contact.",
      },
    ],
    faqs: [
      {
        question: "Can the tooth be saved instead?",
        answer:
          "Often, yes — root canal treatment, a crown or gum treatment can save teeth that look hopeless. We will tell you honestly when a tooth is worth saving and when the money is better spent on what replaces it.",
      },
    ],
    bookable: true,
    icon: "Minus",
    seo: {
      title: "Tooth Extraction in Chandigarh",
      description:
        "Tooth extraction and replacement planning at Advanced Dental Care Centre, Chandigarh.",
    },
  },
  // --------------------------------------------------------------- paediatric
  {
    slug: "pediatric-dentistry",
    category: "paediatric",
    name: "Children's Dentistry",
    summary: "Check-ups, prevention and treatment for children.",
    body: [
      "A child's first dental visit is mostly about making the dental chair unremarkable. Early visits are short, involve a look and a count, and build familiarity before anything needs doing.",
      "Preventive care — fluoride application, fissure sealants on newly erupted molars and diet advice — prevents most childhood decay. Where treatment is needed, it is explained to the child in terms they can follow.",
    ],
    indications: [
      "First dental visit, usually around the first birthday or when the first teeth appear",
      "Routine check-ups and preventive care",
      "Toothache, decay or a dental injury",
      "Concerns about how adult teeth are coming through",
    ],
    steps: [
      { title: "Introduction visit", description: "A short, low-pressure look at the teeth." },
      {
        title: "Prevention",
        description: "Fluoride varnish, sealants and practical diet and brushing advice.",
      },
      {
        title: "Treatment where needed",
        description: "Explained at the child's level, at their pace.",
      },
      {
        title: "Monitoring",
        description:
          "Watching how adult teeth erupt and referring for orthodontic assessment at the right time.",
      },
    ],
    faqs: [
      {
        question: "When should my child first see a dentist?",
        answer:
          "Around the time the first teeth appear, or by the first birthday. The point of an early visit is familiarity, not treatment.",
      },
      {
        question: "Do baby teeth matter if they fall out anyway?",
        answer:
          "Yes. They hold space for the adult teeth, and infection in a baby tooth can affect the developing tooth underneath. Pain and infection also matter in their own right.",
      },
    ],
    bookable: true,
    icon: "Baby",
    seo: {
      title: "Children's Dentist in Chandigarh",
      description:
        "Paediatric dental check-ups, prevention and treatment in Sector 18-A, Chandigarh.",
    },
  },
];

export const BOOKABLE_SERVICES = SERVICES.filter((s) => s.bookable);
export const FEATURED_SERVICES = SERVICES.filter((s) => s.featured);

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function getServicesByCategory(categorySlug: string): Service[] {
  return SERVICES.filter((s) => s.category === categorySlug);
}

export function getServiceByLandingSlug(landingSlug: string): Service | undefined {
  return SERVICES.find((s) => s.seo.landingSlug === landingSlug);
}

export function getCategory(slug: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((c) => c.slug === slug);
}
