type RateFieldProps = {
  id: string;
  label: string;
  hint: string;
  defaultValue: string;
  error?: string;
};

/** Optional annual rate in percent. Blank means "not recorded". */
export function RateField({ id, label, hint, defaultValue, error }: RateFieldProps) {
  const describedBy = error ? `${id}-error` : `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="font-normal text-stone-500">(optional)</span>
      </label>
      <input
        id={id}
        name="annualRate"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 2.5"
        defaultValue={defaultValue}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-sm text-stone-600">
          {hint}
        </p>
      )}
    </div>
  );
}
