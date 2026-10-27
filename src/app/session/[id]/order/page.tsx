import { redirect } from "next/navigation";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/floor?view=order&session=${encodeURIComponent(id)}`);
}
