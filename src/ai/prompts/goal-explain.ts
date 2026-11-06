export const GOAL_EXPLAIN_VERSION = "goal_explain_v1";

export const GOAL_EXPLAIN_INSTRUCTIONS = `Task goal_explain.
Explain the goal using the numbers already calculated. Do not change requiredMonthlyCents, status, or any amount.
summary at most 500 characters. At most 5 steps, each at most 200 characters.
If you cannot answer within these rules, set refused to true and give a short reason, and still include summary and steps.`;
