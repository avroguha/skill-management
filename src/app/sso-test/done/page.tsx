// Where the test pop-up lands after the identity provider. It tells the admin page and closes.
import { Done } from "./done";

export const metadata = { title: "Single sign-on test" };

export default async function SsoTestDone({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Done error={sp.error ?? null} description={sp.error_description ?? null} />;
}
