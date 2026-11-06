import type { CategoryKind, CategoryRecord } from "@/db/repositories/categories";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "./actions";
import { ConfirmDelete } from "./confirm-delete";

type CategoryPanelProps = {
  kind: CategoryKind;
  categories: CategoryRecord[];
};

export function CategoryPanel({ kind, categories }: CategoryPanelProps) {
  const tab = kind === "income" ? "income" : "expenses";

  return (
    <section className="border-t border-stone-200 pt-6">
      <h2 className="text-lg font-semibold">
        {kind === "expense" ? "Expense categories" : "Income categories"}
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        {kind === "expense"
          ? "Essential categories count toward essential monthly spend. A category with entries cannot be deleted."
          : "Income categories group money coming in. Essential does not apply. A category with entries cannot be deleted."}
      </p>

      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-stone-700">No categories yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                {kind === "expense" ? (
                  <th className="py-2 pr-4 font-medium">Essential</th>
                ) : null}
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-stone-100">
                  <td className="py-3 pr-4" colSpan={kind === "expense" ? 3 : 2}>
                    <div className="flex flex-wrap items-center gap-3">
                      <form
                        action={updateCategoryAction}
                        className="flex flex-wrap items-center gap-3"
                      >
                        <input type="hidden" name="id" value={category.id} />
                        <input type="hidden" name="kind" value={kind} />
                        <input
                          aria-label={`${category.name} name`}
                          name="name"
                          type="text"
                          required
                          maxLength={80}
                          defaultValue={category.name}
                          className="w-56 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                        />
                        {kind === "expense" ? (
                          <label className="flex items-center gap-2 text-sm text-stone-800">
                            <input
                              type="checkbox"
                              name="isEssential"
                              value="1"
                              defaultChecked={category.isEssential}
                            />
                            Essential
                          </label>
                        ) : null}
                        <button
                          type="submit"
                          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
                        >
                          Save
                        </button>
                      </form>
                      <ConfirmDelete
                        action={deleteCategoryAction}
                        id={category.id}
                        dialogKey={`category-${category.id}`}
                        hiddenFields={{ tab }}
                        title={`Delete ${category.name}?`}
                        body="This removes the category. Categories that already have expenses or income stay in place."
                        triggerLabel="Delete"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={createCategoryAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="kind" value={kind} />
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`new-${kind}-category`}
            className="text-sm font-medium text-stone-800"
          >
            New category
          </label>
          <input
            id={`new-${kind}-category`}
            name="name"
            type="text"
            required
            maxLength={80}
            className="w-56 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
        </div>
        {kind === "expense" ? (
          <label className="flex items-center gap-2 pb-2 text-sm text-stone-800">
            <input type="checkbox" name="isEssential" value="1" />
            Essential
          </label>
        ) : null}
        <button
          type="submit"
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
        >
          Add category
        </button>
      </form>
    </section>
  );
}
