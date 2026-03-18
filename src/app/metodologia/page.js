import { AppShell } from "@/components/AppShell";
import { Section } from "@/components/Section";
import { METHODOLOGY } from "@/lib/methodology";

export default function MetodologiaPage() {
  return (
    <AppShell title="Metodología">
      <div className="mb-4 text-sm text-zinc-300">
        Esta sección define exactamente cómo se calculan las probabilidades y qué
        parámetros se consideran. El objetivo es que todo sea auditable y fácil de
        ajustar.
      </div>

      {METHODOLOGY.map((block) => (
        <Section key={block.title} title={block.title}>
          <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-200">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ))}
    </AppShell>
  );
}
