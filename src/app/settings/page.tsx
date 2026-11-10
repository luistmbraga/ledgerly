import { getSettings } from "@/db/repositories/settings";
import { SettingsForm } from "./settings-form";
import { BackupSection } from "./backup-section";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const params = await searchParams;
  const row = getSettings();
  const aiConfigured = Boolean(process.env.AI_API_KEY?.trim());
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

        {row ? (
          <SettingsForm
            displayCurrency={row.displayCurrency}
            emergencyFundTargetMonths={row.emergencyFundTargetMonths}
            essentialMonthlySpendOverrideCents={row.essentialMonthlySpendOverrideCents}
          />
        ) : (
          <p role="alert" className="text-sm text-red-800">
            Settings are not initialized. Run pnpm db:migrate.
          </p>
        )}

        <BackupSection />

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
