"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Download, Loader2, Table2 } from "lucide-react";
import {
  getDisbursementRegister,
  getDisbursementRegisterCsv,
  getMyPtezExport,
  getSalesTaxRefundReport,
  type DisbursementRow,
  type ReportFile,
} from "@/actions/reimbursement-reports";
import { downloadCsv } from "@/lib/csv";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/utils";
import { formatDateOnly } from "@/lib/date-only";
import { parseMoney } from "@/lib/reimbursements-shared";

interface ReportsPanelProps {
  /** Only Utah-style policies have a refund to claim. */
  salesTaxRefundTracking: boolean;
  /** Default window: the school year, so the common case is one click. */
  defaultFrom: string;
  defaultTo: string;
}

/**
 * Year-end, as three downloads.
 *
 * Everything here is derived from requests an officer already approved, so the
 * panel deliberately offers no editing — the way to change a number in a report
 * is to fix the request it came from, which leaves an activity row behind.
 */
export function ReportsPanel({
  salesTaxRefundTracking,
  defaultFrom,
  defaultTo,
}: ReportsPanelProps) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [register, setRegister] = useState<DisbursementRow[] | null>(null);

  async function download(key: string, build: () => Promise<ReportFile>) {
    setBusy(key);
    setError(null);
    try {
      const file = await build();
      downloadCsv(file.filename, file.csv);
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't build that report."));
    } finally {
      setBusy(null);
    }
  }

  async function loadRegister() {
    setBusy("register-view");
    setError(null);
    try {
      setRegister(await getDisbursementRegister({ from, to }));
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't load the register."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="report-from">From</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="report-to">To</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Reports cover paid requests by purchase date. The window starts at your
        school year.
      </p>

      {error && (
        <p className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {salesTaxRefundTracking && (
        <ReportCard
          title="Sales tax refund report"
          description="Checks in date order with their purpose and the sales tax paid — the list your state PTA asks for on a refund request. Keep the receipts behind it for at least three years."
          action={
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                download("sales-tax", () =>
                  getSalesTaxRefundReport({ from, to })
                )
              }
            >
              {busy === "sales-tax" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download CSV
            </Button>
          }
        />
      )}

      <ReportCard
        title="Disbursement register"
        description="Every check written, in check-number order — the order the physical file has to be kept in, so the two can be checked against each other line by line."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={loadRegister}
            >
              {busy === "register-view" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Table2 className="h-4 w-4" />
              )}
              View
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                download("register", () =>
                  getDisbursementRegisterCsv({ from, to })
                )
              }
            >
              {busy === "register" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download CSV
            </Button>
          </div>
        }
      />

      {register && <RegisterTable rows={register} />}

      <ReportCard
        title="MyPTEZ export"
        description="Paid requests in the column shape MyPTEZ's transaction import expects. Budget category names are the join key — rename either side until they match."
        action={
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              download("myptez", () => getMyPtezExport({ from, to }))
            }
          >
            {busy === "myptez" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download CSV
          </Button>
        }
      />
    </div>
  );
}

function ReportCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-xl">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RegisterTable({ rows }: { rows: DisbursementRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="border-border bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        No checks written in this window.
      </p>
    );
  }

  const total = rows.reduce((sum, row) => sum + parseMoney(row.totalAmount), 0);

  return (
    <>
      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            className="border-border bg-card rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">Check {row.checkNumber}</p>
                <p className="text-muted-foreground text-sm">{row.payeeName}</p>
              </div>
              <p className="shrink-0 font-medium">
                {formatCurrency(parseMoney(row.totalAmount))}
              </p>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">{row.purpose}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Purchased</dt>
              <dd className="text-right">{formatDateOnly(row.purchaseDate)}</dd>
              <dt className="text-muted-foreground">Budget line</dt>
              <dd className="text-right">{row.budgetCategoryName ?? "—"}</dd>
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="text-right">
                {formatCurrency(parseMoney(row.salesTaxAmount))}
              </dd>
            </dl>
            {row.receiptUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="text-muted-foreground">Receipts</span>
                {row.receiptUrls.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dragon-blue-600 dark:text-dragon-blue-400 hover:underline"
                  >
                    {index + 1}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="border-border bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {rows.length} check{rows.length === 1 ? "" : "s"}
            </span>
            <span className="font-bold">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Desktop table view */}
      <div className="border-border bg-card hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-border text-muted-foreground border-b text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Check</th>
                <th className="px-4 py-3 font-medium">Purchased</th>
                <th className="px-4 py-3 font-medium">Payee</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Budget line</th>
                <th className="px-4 py-3 text-right font-medium">Tax</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Receipts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-border border-b last:border-0"
                >
                  <td className="px-4 py-3 font-medium">{row.checkNumber}</td>
                  <td className="text-muted-foreground px-4 py-3">
                    {formatDateOnly(row.purchaseDate)}
                  </td>
                  <td className="px-4 py-3">{row.payeeName}</td>
                  <td className="text-muted-foreground max-w-xs truncate px-4 py-3">
                    {row.purpose}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {row.budgetCategoryName ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right">
                    {formatCurrency(parseMoney(row.salesTaxAmount))}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(parseMoney(row.totalAmount))}
                  </td>
                  <td className="px-4 py-3">
                    {row.receiptUrls.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      row.receiptUrls.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dragon-blue-600 dark:text-dragon-blue-400 mr-2 hover:underline"
                        >
                          {index + 1}
                        </a>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-border border-t">
                <td className="px-4 py-3 font-medium" colSpan={6}>
                  {rows.length} check{rows.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right font-bold">
                  {formatCurrency(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
