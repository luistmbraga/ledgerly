/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { MoneyInput } from "./money-input";

afterEach(cleanup);

describe("MoneyInput", () => {
  it("renders a labelled text input with the given name", () => {
    render(<MoneyInput id="amount" name="amount" label="Amount" />);
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeDefined();
  });

  it("sets the defaultValue when provided", () => {
    render(<MoneyInput id="price" name="price" label="Price" defaultValue="12.50" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.defaultValue).toBe("12.50");
  });

  it("renders a hint paragraph linked by aria-describedby when hint is provided", () => {
    render(<MoneyInput id="cost" name="cost" label="Cost" hint="Enter without currency symbol" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.getAttribute("aria-describedby")).toBe("cost-hint");
    expect(screen.getByText("Enter without currency symbol")).toBeDefined();
  });

  it("omits aria-describedby when no hint is given", () => {
    render(<MoneyInput id="val" name="val" label="Value" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});
