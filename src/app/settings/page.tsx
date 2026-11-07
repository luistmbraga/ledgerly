import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MoneyInput } from "@/components/money-input";
import { getSettings, updateSettings } from "@/db/repositories/settings";
import { centsToDecimalInput, formatMoney, parseMoneyToCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function saveSettings(formData: FormData) {
  "use server";

  const errors: string[] = [];
  const currency = String(formData.get("displayCurrency") ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.push("Display currency must be 3 letters.");
  }

  const monthsRaw = String(formData.get("emergencyFundTargetMonths") ?? "").trim();
  const months = Number(monthsRaw);
  if (!/^\d+$/.test(monthsRaw) || months < 1 || months > 24) {
    errors.push("Emergency fund target months must be a whole number from 1 to 24.");
  }

  const overrideRaw = String(
    formData.get("essentialMonthlySpendOverride") ?? "",
  );
  let overrideCents: number | null = null;
  if (overrideRaw.trim() !== "") {
    const parsed = parseMoneyToCents(overrideRaw);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else {
      overrideCents = parsed.cents;
    }
  }

  if (errors.length > 0) {
    redirect(`/settings?error=${encodeURIComponent(errors.join(" "))}`);
  }

  const existing = getSettings();
  if (!existing) {
    redirect(
      `/settings?error=${encodeURIComponent("Settings are not initialized. Run pnpm db:migrate.")}`,
    );
  }

  updateSettings({
    displayCurrency: currency,
    emergencyFundTargetMonths: months,
    essentialMonthlySpendOverrideCents: overrideCents,
  });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const row = getSettings();
  const aiConfigured = Boolean(process.env.AI_API_KEY?.trim());
  const error = params.error;
  const saved = params.saved === "1";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <header className="border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-stone-600">
          Display currency and emergency fund defaults for this app.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-6">
        {saved ? (
          <p
            role="status"
            className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
          >
            Settings saved.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {row ? (
          <form action={saveSettings} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="displayCurrency"
                className="text-sm font-medium text-stone-800"
              >
                Display currency
              </label>
              <input
                id="displayCurrency"
                name="displayCurrency"
                type="text"
                required
                minLength={3}
                maxLength={3}
                pattern="[A-Za-z]{3}"
                autoComplete="off"
                defaultValue={row.displayCurrency}
                aria-describedby="displayCurrency-hint"
                className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm uppercase text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <p id="displayCurrency-hint" className="text-sm text-amber-800">
                Does not convert existing amounts. One display currency is used
                for every figure (default EUR).
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="emergencyFundTargetMonths"
                className="text-sm font-medium text-stone-800"
              >
                Emergency fund target months
              </label>
              <input
                id="emergencyFundTargetMonths"
                name="emergencyFundTargetMonths"
                type="number"
                required
                min={1}
                max={24}
                step={1}
                defaultValue={row.emergencyFundTargetMonths}
                className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>

            <MoneyInput
              id="essentialMonthlySpendOverride"
              name="essentialMonthlySpendOverride"
              label="Essential monthly spend override"
              defaultValue={
                row.essentialMonthlySpendOverrideCents === null
                  ? ""
                  : centsToDecimalInput(row.essentialMonthlySpendOverrideCents)
              }
              hint={
                row.essentialMonthlySpendOverrideCents === null
                  ? "Optional. Leave blank to clear. Example: 1500.00."
                  : `Optional. Current value ${formatMoney(row.essentialMonthlySpendOverrideCents, row.displayCurrency)}. Leave blank to clear.`
              }
            />

            <button
              type="submit"
              className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Save settings
            </button>
          </form>
        ) : (
          <p role="alert" className="text-sm text-red-800">
            Settings are not initialized. Run pnpm db:migrate.
          </p>
        )}

        <dl className="grid gap-3 border-t border-stone-200 pt-4 text-sm">
          <div>
            <dt className="font-medium text-stone-800">AI status</dt>
            <dd className="text-stone-600">
              {aiConfigured ? "configured" : "not configured"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-stone-800">Data path</dt>
            <dd className="font-mono text-stone-600">data/ledgerly.db</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
