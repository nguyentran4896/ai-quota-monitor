import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/renderer/App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.quotaMonitor;
  });

  it("renders the quota dashboard in browser preview mode", async () => {
    render(<App />);
    expect(await screen.findByText("Your AI runway,")).toBeInTheDocument();
    expect(screen.getAllByText("Claude — Studio")).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "97% available" })).toBeInTheDocument();
  });
});
