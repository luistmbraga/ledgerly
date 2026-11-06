import { eq } from "drizzle-orm";
import { db } from "./client";
import { categories, settings } from "./schema";

const EXPENSE_CATEGORIES: { name: string; isEssential: boolean }[] = [
  { name: "Housing", isEssential: true },
  { name: "Utilities", isEssential: true },
  { name: "Groceries", isEssential: true },
  { name: "Transport", isEssential: false },
  { name: "Dining", isEssential: false },
  { name: "Health", isEssential: true },
  { name: "Insurance", isEssential: true },
  { name: "Entertainment", isEssential: false },
  { name: "Shopping", isEssential: false },
  { name: "Education", isEssential: false },
  { name: "Other", isEssential: false },
];

const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Investment income",
  "Other",
];

const existing = db.select().from(settings).where(eq(settings.id, 1)).get();

if (!existing) {
  const now = new Date().toISOString();
  db.insert(settings)
    .values({
      id: 1,
      displayCurrency: "EUR",
      emergencyFundTargetMonths: 6,
      essentialMonthlySpendOverrideCents: null,
      personalityRevealedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  console.log("Inserted settings row id=1 (EUR, 6 months).");
} else {
  console.log("Settings row id=1 already present.");
}

const existingCategories = db.select({ id: categories.id }).from(categories).all();

if (existingCategories.length === 0) {
  const createdAt = new Date().toISOString();
  db.transaction((tx) => {
    EXPENSE_CATEGORIES.forEach((category, index) => {
      tx.insert(categories)
        .values({
          name: category.name,
          kind: "expense",
          isEssential: category.isEssential,
          sortOrder: index,
          createdAt,
        })
        .run();
    });
    INCOME_CATEGORIES.forEach((name, index) => {
      tx.insert(categories)
        .values({
          name,
          kind: "income",
          isEssential: false,
          sortOrder: index,
          createdAt,
        })
        .run();
    });
  });
  console.log(
    `Seeded ${EXPENSE_CATEGORIES.length} expense categories and ${INCOME_CATEGORIES.length} income categories.`,
  );
} else {
  console.log("Categories already present.");
}
