"use client";

import { BRAND_FONTS, loadFont } from "@/lib/brand";
import { useEditor } from "@/lib/store";

const NONE: never[] = [];

/** Typography picker: the client's own fonts (brand) + the recommended ones. "" = `emptyLabel`. */
export default function FontSelect({
  id,
  value,
  onChange,
  emptyLabel,
}: {
  id: string;
  value: string;
  onChange: (font: string) => void;
  emptyLabel: string;
}) {
  const brandFonts = useEditor((s) => s.brand?.fonts);
  const extra = brandFonts ?? NONE;
  const known = !value || extra.some((f) => f.name === value) || BRAND_FONTS.some((f) => f.name === value);
  return (
    <select
      id={id}
      className="input"
      value={value}
      style={value ? { fontFamily: `"${value}", sans-serif` } : undefined}
      onChange={(e) => {
        const v = e.target.value;
        if (v) loadFont(v);
        onChange(v);
      }}
    >
      <option value="">{emptyLabel}</option>
      {!known && <option value={value}>{value}</option>}
      {extra.length > 0 && (
        <optgroup label="Tus tipografías">
          {extra.map((f) => (
            <option key={f.name} value={f.name} style={{ fontFamily: `"${f.name}", sans-serif` }}>
              {f.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Recomendadas">
        {BRAND_FONTS.map((f) => (
          <option key={f.name} value={f.name} style={{ fontFamily: `"${f.name}", sans-serif` }}>
            {f.name} — {f.style}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
