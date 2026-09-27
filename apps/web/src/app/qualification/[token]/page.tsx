import { PublicQualificationRunner } from "./public-qualification-runner";

export const metadata = { title: "Qualification" };

export default async function PublicQualificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicQualificationRunner token={token} />;
}
