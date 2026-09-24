"use client";

import { useState } from "react";
import { AvatarSvg } from "./avatar-svg";
import { ACCESSORIES, BASES, EYES, HAIRS, MOUTHS } from "./pieces";
import { BG_COLORS, HAIR_COLORS, SKIN_COLORS } from "./palette";
import { randomAvatar, type Avatar } from "./schema";

type Category =
  | { key: "base"; label: string; kind: "shape"; count: number; names: string[] }
  | { key: "hair"; label: string; kind: "shape"; count: number; names: string[] }
  | { key: "eyes"; label: string; kind: "shape"; count: number; names: string[] }
  | { key: "mouth"; label: string; kind: "shape"; count: number; names: string[] }
  | { key: "accessory"; label: string; kind: "shape"; count: number; names: string[]; nullable: true }
  | { key: "skin"; label: string; kind: "color"; colors: readonly string[] }
  | { key: "hairColor"; label: string; kind: "color"; colors: readonly string[] }
  | { key: "bg"; label: string; kind: "color"; colors: readonly string[] };

const CATEGORIES: Category[] = [
  { key: "base", label: "cara", kind: "shape", count: BASES.length, names: BASES.map((b) => b.name) },
  { key: "skin", label: "piel", kind: "color", colors: SKIN_COLORS },
  { key: "hair", label: "pelo", kind: "shape", count: HAIRS.length, names: HAIRS.map((h) => h.name) },
  { key: "hairColor", label: "color de pelo", kind: "color", colors: HAIR_COLORS },
  { key: "eyes", label: "ojos", kind: "shape", count: EYES.length, names: EYES.map((e) => e.name) },
  { key: "mouth", label: "boca", kind: "shape", count: MOUTHS.length, names: MOUTHS.map((m) => m.name) },
  {
    key: "accessory",
    label: "extra",
    kind: "shape",
    count: ACCESSORIES.length,
    names: ACCESSORIES.map((a) => a.name),
    nullable: true,
  },
  { key: "bg", label: "fondo", kind: "color", colors: BG_COLORS },
];

// Editor de avatar: vista previa grande arriba, categorías como chips, y una
// grilla de miniaturas donde cada opción se ve aplicada al avatar actual.
export function AvatarEditor({
  value,
  onChange,
  previewSize = 144,
}: {
  value: Avatar;
  onChange: (next: Avatar) => void;
  previewSize?: number;
}) {
  const [category, setCategory] = useState<Category>(CATEGORIES[2]!);

  return (
    <div className="flex flex-col gap-4" data-testid="avatar-editor">
      <div className="flex items-end justify-between gap-4">
        <AvatarSvg avatar={value} size={previewSize} label="tu avatar" />
        <button
          type="button"
          onClick={() => onChange(randomAvatar())}
          className="btn-secondary-sm"
        >
          al azar
        </button>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="partes del avatar">
        {CATEGORIES.map((c) => {
          const active = c.key === category.key;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(c)}
              className={`chip shrink-0 ${
                active ? "bg-tinta text-fondo" : "bg-superficie text-tinta-suave"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {category.kind === "color" ? (
        <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label={category.label}>
          {category.colors.map((color) => {
            const selected = value[category.key] === color;
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${category.label} ${color}`}
                onClick={() => onChange({ ...value, [category.key]: color })}
                className="aspect-square rounded-full border-4"
                style={{ background: color, borderColor: selected ? "#f5f3ff" : "transparent" }}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label={category.label}>
          {"nullable" in category ? (
            <Thumb
              label="sin extra"
              selected={value.accessory === null}
              onClick={() => onChange({ ...value, accessory: null })}
              avatar={{ ...value, accessory: null }}
            />
          ) : null}
          {Array.from({ length: category.count }, (_, i) => i + 1).map((id) => {
            const next = { ...value, [category.key]: id } as Avatar;
            return (
              <Thumb
                key={id}
                label={`${category.label} ${category.names[id - 1] ?? id}`}
                selected={value[category.key] === id}
                onClick={() => onChange(next)}
                avatar={next}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Thumb({
  label,
  selected,
  onClick,
  avatar,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  avatar: Avatar;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      className="rounded-full border-4 p-0.5"
      style={{ borderColor: selected ? "#f5f3ff" : "transparent" }}
    >
      <AvatarSvg avatar={avatar} size={64} label={label} className="block h-auto w-full" />
    </button>
  );
}
