import { Frog } from "@/components/frog/Frog";

// Campeón de la temporada anterior: la rana con corona al lado del nombre,
// durante toda la temporada siguiente. La rana en sí es decorativa, así que
// el significado va en el contenedor.
export function Crown({ title = "campeón de la temporada pasada", size = 22 }: { title?: string; size?: number }) {
  return (
    <span role="img" aria-label={title} title={title} className="inline-flex shrink-0 align-middle" data-testid="crown">
      <Frog pose="corona" size={size} animate={false} />
    </span>
  );
}
