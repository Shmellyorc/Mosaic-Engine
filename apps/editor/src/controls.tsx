import { useState, type ReactNode } from "react";

export function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-content">{children}</div>
    </details>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  maxLength?: number;
};

export function TextField(props: TextFieldProps) {
  return <TextInput key={props.value} {...props} />;
}

function TextInput({
  label,
  value,
  onChange,
  allowEmpty = false,
  maxLength = 100,
}: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const text = event.currentTarget.value;
        if ((allowEmpty || text.trim()) && value !== text)
          onChange(allowEmpty ? text : text.trim());
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = value;
          setDraft(value);
        }
      }}
    />
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

export function NumberField(props: NumberFieldProps) {
  return <NumberInput key={props.value} {...props} />;
}

function NumberInput({
  label,
  value,
  onChange,
  min = -1e7,
  max = 1e7,
  step = 1,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))));
  return (
    <input
      aria-label={label}
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const parsed = event.currentTarget.valueAsNumber;
        if (Number.isFinite(parsed)) {
          const limit = Math.max(min, Math.min(max, parsed));
          const next = step === 1 ? Math.round(limit) : limit;
          setDraft(String(next));
          if (value !== next) onChange(next);
        } else setDraft(String(value));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(String(value));
      }}
    />
  );
}
