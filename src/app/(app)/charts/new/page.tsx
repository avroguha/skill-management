import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/heatmap";
import { requireViewer, getEngine } from "@/lib/server";
import { ChartBuilder } from "../builder";
import { builderOptions, newSpec } from "../options";

export const metadata = { title: "New chart" };

export default async function NewChartPage() {
  const v = await requireViewer();
  if (!v.canBuildCharts) redirect("/");
  const options = await builderOptions(v, await getEngine());
  const spec = newSpec(options);
  return (
    <>
      <PageHeader title="New chart" crumbs={[{ label: "Charts", href: "/charts" }, { label: "New" }]}
        description="Pick what to show and how to group it; the preview is worked out from live data as you go." />
      {spec ? <ChartBuilder initial={{ name: "On target by team", description: "", spec: { ...spec, groupBy: "team" } }} options={options} />
        : <Empty>There is no hierarchy for you to chart yet. An administrator gives operators hierarchies in Admin › Users & access.</Empty>}
    </>
  );
}
