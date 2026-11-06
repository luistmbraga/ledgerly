type MoneyInputProps = {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  hint?: string;
};

export function MoneyInput({
  id,
  name,
  label,
  defaultValue = "",
  hint,
}: MoneyInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-stone-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        defaultValue={defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-stone-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
