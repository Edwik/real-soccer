import { MatchClient } from "./MatchClient";

export default async function MatchPage({ params }) {
  const { id } = await params;
  return <MatchClient eventId={id} />;
}
