// Every e-mail the app sends, rendered with made-up content, so an administrator can see
// exactly what people will get before switching e-mail on (Settings › E-mail › Preview).
import { render, type MailKind, type Payloads, type RenderContext } from "./templates.ts";

export const PREVIEW_KINDS: { kind: MailKind; label: string; to: string }[] = [
  { kind: "submitted", label: "Ratings sent to the manager", to: "Thessia Quellis" },
  { kind: "digest", label: "Weekly: what waits for a manager", to: "Thessia Quellis" },
  { kind: "validated", label: "Ratings confirmed", to: "Zorvan Vantor" },
  { kind: "returned", label: "A rating sent back", to: "Zorvan Vantor" },
  { kind: "reminder", label: "Weekly: finish your skills", to: "Zorvan Vantor" },
  { kind: "nudge", label: "A manager's reminder", to: "Zorvan Vantor" },
  { kind: "test", label: "The test e-mail", to: "Administrator" },
];

const SAMPLE: { [K in MailKind]: Payloads[K] } = {
  test: { byName: "Administrator" },
  submitted: {
    personName: "Zorvan Vantor", personTitle: "Senior Cloud Engineer", personId: "sample",
    items: [
      { skill: "AWS › EC2", self: 4, target: 3, note: "Ran the migration of the billing service" },
      { skill: "Kubernetes", self: 3, target: 3, note: "" },
      { skill: "Terraform", self: 2, target: 3, note: "Learning it on the platform team's modules" },
    ],
  },
  digest: {
    waitingRatings: 9,
    waitingPeople: [{ name: "Zorvan Vantor", waiting: 3, state: "" }, { name: "Ixara Belqar", waiting: 6, state: "" }],
    notStarted: [{ name: "Okrin Tavrin", waiting: 0, state: "not started" }, { name: "Nuuma Skarn", waiting: 0, state: "not started" }],
    teamSize: 8,
  },
  validated: {
    byName: "Thessia Quellis", personId: "sample",
    items: [
      { skill: "AWS › EC2", self: 4, validated: 4, note: "" },
      { skill: "Kubernetes", self: 3, validated: 3, note: "" },
      { skill: "Python", self: 4, validated: 3, note: "Strong, but not yet the person others come to" },
    ],
  },
  returned: { byName: "Thessia Quellis", items: [{ skill: "Terraform", self: 4, note: "Can you add an example? This is higher than what I have seen." }] },
  reminder: { rated: 4, required: 7, missing: ["Linux administration", "Observability", "Terraform"], sentBack: 0 },
  nudge: { byName: "Thessia Quellis", note: "Please finish by Friday: we plan next quarter's training from it.", rated: 2, required: 7, missing: ["AWS › IAM", "Kubernetes", "Linux administration", "Python", "Terraform"] },
};

export function previewEmails(ctx: Omit<RenderContext, "toName">) {
  return PREVIEW_KINDS.map((p) => {
    const r = render(p.kind, SAMPLE[p.kind] as never, { ...ctx, toName: p.to });
    return { kind: p.kind, label: p.label, to: p.to, subject: r.subject, html: r.html, text: r.text };
  });
}
