import { MoneyInput } from "@/components/money-input";
import { bpsToPercentInput } from "./labels";

export type GoalFormDefaults = {
  name: string;
  targetAmount: string;
  targetDate: string;
  setAside: string;
  plannedMonthly: string;
  expectedReturnPercent: string;
};

type GoalFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  id?: number;
  defaults?: GoalFormDefaults;
};

export function GoalForm({ action, submitLabel, id, defaults }: GoalFormProps) {
  const field = (name: string) => (id === undefined ? name : `${name}-${id}`);

  return (
    <form action={action} className="flex flex-col gap-4">
      {id !== undefined ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={field("name")} className="text-sm font-medium text-stone-800">
          Name
        </label>
        <input
          id={field("name")}
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={defaults?.name ?? ""}
          autoComplete="off"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <MoneyInput
        id={field("targetAmount")}
        name="targetAmount"
        label="Target amount"
        defaultValue={defaults?.targetAmount ?? ""}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={field("targetDate")} className="text-sm font-medium text-stone-800">
          Target date
        </label>
        <input
          id={field("targetDate")}
          name="targetDate"
          type="date"
          required
          defaultValue={defaults?.targetDate ?? ""}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <MoneyInput
        id={field("setAside")}
        name="setAside"
        label="Set aside"
        defaultValue={defaults?.setAside ?? ""}
        hint="Amount already saved toward this goal. Leave blank for zero."
      />
      <MoneyInput
        id={field("plannedMonthly")}
        name="plannedMonthly"
        label="Planned monthly"
        defaultValue={defaults?.plannedMonthly ?? ""}
        hint="Optional. Leave blank to compare the goal with your recent average surplus."
      />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={field("expectedReturn")}
          className="text-sm font-medium text-stone-800"
        >
          Expected return %
        </label>
        <input
          id={field("expectedReturn")}
          name="expectedReturn"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          defaultValue={defaults?.expectedReturnPercent ?? ""}
          aria-describedby={`${field("expectedReturn")}-hint`}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
        <p id={`${field("expectedReturn")}-hint`} className="text-sm text-stone-600">
          Optional annual percent. A planning assumption, not a guaranteed return.
        </p>
      </div>
      <button
        type="submit"
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
      >
        {submitLabel}
      </button>
    </form>
  );
}

export function percentDefault(bps: number | null): string {
  return bps === null ? "" : bpsToPercentInput(bps);
}
