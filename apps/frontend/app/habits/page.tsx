type HabitsPageProps = {
  searchParams?: {
    from?: string;
  };
};

export default function HabitsPage({ searchParams }: HabitsPageProps) {
  const from = searchParams?.from === "ikigai" ? "?from=ikigai" : "";

  return (
    <iframe
      className="habits-frame"
      data-testid="habits-frame"
      src={`/habits-standalone.html${from}`}
      title="ORKEN.LIFE habits program"
    />
  );
}
