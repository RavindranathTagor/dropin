import { OperatorBid } from "@/components/operator-desk";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OperatorBid roomId={id} />;
}
