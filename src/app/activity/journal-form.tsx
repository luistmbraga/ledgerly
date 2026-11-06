import { MoneyInput } from "@/components/money-input";
import { SuggestCategory } from "./suggest-category";

type CategoryOption = {
  id: number;
  name: string;
};

type JournalFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  idPrefix: string;
  submitLabel: string;
  categories: CategoryOption[];
  cancelHref?: string;
  entryId?: number;
  suggestExpenseId?: number | null;
  defaults?: {
    amount: string;
    occurredOn: string;
    categoryId: number | null;
    note: string;
  };
};

export function JournalForm({
  action,
  idPrefix,
  submitLabel,
  categories,
  cancelHref,
  entryId,
  suggestExpenseId,
  defaults,
}: JournalFormProps) {
  const amountId = `${idPrefix}-amount`;
  const dateId = `${idPrefix}-date`;
  const categoryId = `${idPrefix}-category`;
  const noteId = `${idPrefix}-note`;

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      {entryId !== undefined ? (
        <input type="hidden" name="id" value={entryId} />
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={dateId} className="text-sm font-medium text-stone-800">
          Date
        </label>
        <input
          id={dateId}
          name="occurredOn"
          type="date"
          required
          defaultValue={defaults?.occurredOn ?? ""}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
      </div>
      <MoneyInput
        id={amountId}
        name="amount"
        label="Amount"
        defaultValue={defaults?.amount ?? ""}
      />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={categoryId}
          className="text-sm font-medium text-stone-800"
        >
          Category
        </label>
        <select
          id={categoryId}
          name="categoryId"
          defaultValue={
            defaults?.categoryId === null || defaults?.categoryId === undefined
              ? ""
              : String(defaults.categoryId)
          }
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-sm font-medium text-stone-800">
          Note
        </label>
        <input
          id={noteId}
          name="note"
          type="text"
          maxLength={500}
          defaultValue={defaults?.note ?? ""}
          autoComplete="off"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
        />
        {suggestExpenseId !== undefined ? (
          <SuggestCategory idPrefix={idPrefix} expenseId={suggestExpenseId} />
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          {submitLabel}
        </button>
        {cancelHref ? (
          <a
            href={cancelHref}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
          >
            Cancel
          </a>
        ) : null}
      </div>
    </form>
  );
}
