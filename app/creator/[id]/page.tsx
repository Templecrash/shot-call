import Supertake from "@/app/supertake";
export const dynamic = "force-dynamic";
export const metadata = { title: "Creator profile · Shot Call" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Supertake initialCreatorId={id} />;
}
