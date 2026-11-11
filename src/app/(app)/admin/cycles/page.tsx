import { desc, eq, count, and, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/kpi";
import { AdminCrud } from "@/components/admin-crud";
import { saveCycle } from "@/app/actions/admin";

export const metadata = { title: "Cycles · Admin" };

export default async function CyclesAdmin() {
  const db = await getDb();
  const cycles = await db.select().from(schema.assessmentCycle).orderBy(desc(schema.assessmentCycle.startsOn));
  const counts = await db.select({ cycleId: schema.rating.cycleId, n: count() }).from(schema.rating)
    .where(and(isNotNull(schema.rating.cycleId), isNotNull(schema.rating.selfLevel))).groupBy(schema.rating.cycleId);
  const [{ people }] = await db.select({ people: count() }).from(schema.employee).where(eq(schema.employee.active, true));
  return (
    <>
      <PageHeader title="Assessment cycles"
        description={`A cycle is a round of self-assessment with a due date. Opening one closes any other. People can keep their skills current at any time; the cycle gives it a deadline. ${people} active people.`} />
      <Section title="Cycles">
        <AdminCrud noun="cycle"
          rows={cycles.map((c) => ({ id: c.id, name: c.name, startsOn: c.startsOn, dueOn: c.dueOn, status: c.status, ratings: counts.find((x) => x.cycleId === c.id)?.n ?? 0 }))}
          columns={[
            { key: "name", header: "Cycle" },
            { key: "startsOn", header: "Starts", kind: "date" },
            { key: "dueOn", header: "Due", kind: "date" },
            { key: "status", header: "Status", kind: "badge", facet: true },
            { key: "ratings", header: "Self-ratings", kind: "number", align: "right" },
          ]}
          defaults={{ status: "draft" }}
          fields={[
            { name: "name", label: "Name", placeholder: "2027 H1 assessment" },
            { name: "startsOn", label: "Starts", type: "date", half: true },
            { name: "dueOn", label: "Due", type: "date", half: true },
            { name: "status", label: "Status", type: "select", options: [
              { value: "draft", label: "Draft" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" },
            ] },
          ]}
          save={saveCycle} />
      </Section>
    </>
  );
}
