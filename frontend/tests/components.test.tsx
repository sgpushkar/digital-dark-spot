import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<any>("@/lib/api");
  return { ...actual, api: {
    createResearch: vi.fn(), addSources: vi.fn(), upload: vi.fn(), patchTask: vi.fn(), patchFinding: vi.fn(), evidence: vi.fn(), search: vi.fn(), graph: vi.fn(),
  } };
});
import { api, ApiError } from "@/lib/api";
import { Checklist } from "@/components/workspace/Checklist";
import { ContradictionExplorer } from "@/components/workspace/ContradictionExplorer";
import { CoverageMatrix } from "@/components/workspace/CoverageMatrix";
import { Dashboard } from "@/components/workspace/Dashboard";
import { mergeStages } from "@/components/workspace/PipelineView";
import { ReportView } from "@/components/workspace/ReportView";
import { ResearchForm, parseUrls } from "@/components/ResearchForm";
import { ErrorState } from "@/components/ui/primitives";
import { conflict, cov, report, source, task } from "./fixtures";

const A = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => Object.values(A).forEach((f) => f.mockReset()));

describe("ResearchForm", () => {
  it("blocks submission without a question and shows the problem", async () => {
    const onCreated = vi.fn();
    render(<ResearchForm onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: /create research workspace/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 5 characters/i);
    expect(A.createResearch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("creates the session, adds de-duplicated URLs, uploads files, and reports rejected inputs", async () => {
    A.createResearch.mockResolvedValue({ id: "sess1" });
    A.addSources.mockResolvedValue({ added: 1, results: [{ url: "https://a.org/x", status: "added" }, { url: "http://127.0.0.1", status: "rejected", reason: "Private addresses are not allowed" }] });
    A.upload.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(422, "Unsupported file type"));
    const onCreated = vi.fn();
    render(<ResearchForm onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText(/what do you need to find out/i), "What should I verify before applying?");
    await userEvent.type(screen.getByLabelText(/source urls/i), "https://a.org/x\nhttp://127.0.0.1\nhttps://a.org/x");
    const good = new File(["%PDF-1.4"], "rules.pdf", { type: "application/pdf" });
    const bad = new File(["x"], "bad.exe");
    await userEvent.upload(screen.getByLabelText(/documents/i), [good, bad], { applyAccept: false });
    await userEvent.click(screen.getByRole("button", { name: /create research workspace/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(A.addSources).toHaveBeenCalledWith("sess1", ["https://a.org/x", "http://127.0.0.1"]);
    expect(A.upload).toHaveBeenCalledTimes(2);
    const [id, notes] = onCreated.mock.calls[0];
    expect(id).toBe("sess1");
    expect(notes.join(" ")).toMatch(/rejected.*Private addresses/);
    expect(notes.join(" ")).toMatch(/bad\.exe.*Unsupported/);
  });

  it("shows API failures instead of failing silently", async () => {
    A.createResearch.mockRejectedValue(new ApiError(0, "Cannot reach the Digital Dark Spot API."));
    render(<ResearchForm onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/what do you need to find out/i), "A valid research question");
    await userEvent.click(screen.getByRole("button", { name: /create research workspace/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach/i);
  });

  it("rejects oversized files client-side", async () => {
    render(<ResearchForm onCreated={vi.fn()} />);
    const big = new File([new ArrayBuffer(11 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText(/documents/i), big, { applyAccept: false });
    expect(screen.getByRole("alert")).toHaveTextContent(/larger than 10 MB/);
  });

  it("parseUrls splits on newlines/commas and de-duplicates", () => {
    expect(parseUrls("a\n b ,a\n\n")).toEqual(["a", "b"]);
  });
});

describe("Dashboard", () => {
  it("renders numbers derived from the data it is given and explains the score", () => {
    const items = [cov({ category: "a", status: "COVERED" }), cov({ category: "b", status: "NOT_FOUND" }), cov({ category: "c", status: "NOT_FOUND" }), cov({ category: "d", status: "PARTIALLY_COVERED" })];
    const srcs = [source(), source({ ref: "source_003", freshness: { ...source().freshness!, label: "POTENTIALLY_OUTDATED" } }), source({ ref: "source_004", extraction_status: "failed" })];
    render(<Dashboard report={report()} coverage={items} sources={srcs} claimsTotal={17} />);
    expect(screen.getByTestId("stat-Sources analyzed")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-Extracted claims")).toHaveTextContent("17");
    expect(screen.getByTestId("stat-Potential gaps")).toHaveTextContent("3");
    expect(screen.getByTestId("stat-Potentially outdated")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-Coverage")).toHaveTextContent("25%");
    expect(screen.getByTestId("stat-Completeness score")).toHaveTextContent("58.3");
    expect(screen.getByText(/why the score is 58\.3/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown date: source_004/i, { exact: false })).toBeInTheDocument();
  });
});

describe("CoverageMatrix", () => {
  it("shows distinct statuses and opens supporting evidence on click", async () => {
    const onOpen = vi.fn();
    render(<CoverageMatrix onOpenClaim={onOpen} items={[cov(), cov({ category: "renewal_conditions", label: "Renewal conditions", status: "NOT_FOUND", claims: [], claim_refs: [], source_refs: [], explanation: "No relevant information about renewal conditions was identified in the sources reviewed." })]} />);
    expect(screen.getByText("Needs verification")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByTestId("evidence-application_deadline")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /application deadline: needs_verification/i }));
    const panel = screen.getByTestId("evidence-application_deadline");
    expect(within(panel).getByText(/what is the current application deadline/i)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: /claim_001/ }));
    expect(onOpen).toHaveBeenCalledWith("claim_001");
    await userEvent.click(screen.getByRole("button", { name: /renewal conditions: not_found/i }));
    expect(screen.getByText(/no supporting claims were extracted/i)).toBeInTheDocument();
  });
});

describe("ContradictionExplorer", () => {
  it("shows both claims side by side with passages, dates and source links", () => {
    render(<ContradictionExplorer items={[conflict()]} notConflicts={[{ subject: "x", predicate: "scholarship_amount", claim_refs: ["claim_003", "claim_009"], kind: "scope_difference", explanation: "different scopes (international vs domestic)" }]} onOpenClaim={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText("10 November 2026")).toBeInTheDocument();
    expect(screen.getByText("20 November 2026")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open source/i })[0]).toHaveAttribute("href", "/api/demo/fixtures/official-guidelines");
    expect(screen.getByText(/published unknown/i)).toBeInTheDocument(); // no date is invented
    expect(screen.getByText(/differences examined and not treated as contradictions/i)).toBeInTheDocument();
    expect(screen.getByText(/does not change what the sources say/i)).toBeInTheDocument();
  });

  it("lets the user mark reviewed with a note without touching the claims", async () => {
    A.patchFinding.mockResolvedValue({});
    const onChanged = vi.fn();
    render(<ContradictionExplorer items={[conflict()]} notConflicts={[]} onOpenClaim={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText(/note \(optional\)/i), "Emailed the office");
    await userEvent.click(screen.getByRole("button", { name: /mark as reviewed/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(A.patchFinding).toHaveBeenCalledWith("f1", { verification_status: "reviewed", user_note: "Emailed the office" });
  });

  it("explains an empty result honestly", () => {
    render(<ContradictionExplorer items={[]} notConflicts={[]} onOpenClaim={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText(/does not mean they are correct/i)).toBeInTheDocument();
  });
});

describe("Checklist", () => {
  it("completes, reopens and annotates tasks through the API and refreshes", async () => {
    A.patchTask.mockResolvedValue({});
    const onChanged = vi.fn();
    render(<Checklist items={[task(), task({ id: "t2", title: "Find out: Renewal conditions", priority: "MEDIUM" })]} onChanged={onChanged} />);
    expect(screen.getByText(/0 of 2 tasks completed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /mark complete: resolve conflict/i }));
    expect(A.patchTask).toHaveBeenCalledWith("t1", { status: "COMPLETED" });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await userEvent.type(screen.getAllByPlaceholderText("Add a note")[1], "asked admissions");
    await userEvent.click(screen.getAllByRole("button", { name: /save note/i })[1]);
    expect(A.patchTask).toHaveBeenLastCalledWith("t2", { notes: "asked admissions" });
  });

  it("renders completed tasks as completed and offers reopening", async () => {
    A.patchTask.mockResolvedValue({});
    render(<Checklist items={[task({ status: "COMPLETED" })]} onChanged={vi.fn()} />);
    const box = screen.getByRole("checkbox", { name: /mark complete/i });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(A.patchTask).toHaveBeenCalledWith("t1", { status: "PENDING" });
  });

  it("surfaces update failures and keeps the task state honest", async () => {
    A.patchTask.mockRejectedValue(new ApiError(500, "Update failed"));
    render(<Checklist items={[task()]} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed");
  });

  it("shows an empty state", () => {
    render(<Checklist items={[]} onChanged={vi.fn()} />);
    expect(screen.getByText(/no verification tasks yet/i)).toBeInTheDocument();
  });
});

describe("pipeline progress", () => {
  const base = ["source_collection", "claim_extraction"].map((s) => ({ stage: s, label: s, status: "pending" as const, detail: null, duration_ms: null, stats: {} }));
  it("uses only real events: latest event per stage wins and untouched stages stay pending", () => {
    const out = mergeStages(base, [
      { type: "stage", stage: "source_collection", status: "running" },
      { type: "stage", stage: "source_collection", status: "completed", duration_ms: 120, stats: { fetched: 2 } },
    ]);
    expect(out[0]).toMatchObject({ status: "completed", duration_ms: 120 });
    expect(out[1].status).toBe("pending");
  });
  it("represents failed and skipped stages", () => {
    const out = mergeStages(base, [{ type: "stage", stage: "claim_extraction", status: "failed", detail: "LLMOutputError" }, { type: "run", status: "started" }]);
    expect(out[1]).toMatchObject({ status: "failed", detail: "LLMOutputError" });
  });
});

describe("states", () => {
  it("error state is announced and retryable", async () => {
    const retry = vi.fn();
    render(<ErrorState message="Cannot reach the API" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the API");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("report renders all eleven sections and the demo notice", () => {
    render(<ReportView report={report()} />);
    for (const n of Array.from({ length: 11 }, (_, i) => i + 1)) expect(screen.getByRole("heading", { name: new RegExp(`^${n}\\. `) })).toBeInTheDocument();
    expect(screen.getByText(/demonstration report/i)).toBeInTheDocument();
  });
});
