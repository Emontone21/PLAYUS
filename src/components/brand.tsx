import { Frog } from "@/components/frog/Frog";

// La marca, arriba de cada pantalla: la rana quieta al lado de "frog".
export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="brand">
      <Frog pose="feliz" size={40} animate={false} />
      <span className="display text-rana" style={{ fontSize: 28 }}>
        frog
      </span>
    </div>
  );
}
