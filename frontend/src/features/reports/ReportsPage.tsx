import { useState } from "react";
import AttendanceSummaryTab from "./tabs/AttendanceSummaryTab";
import CustomerStatementTab from "./tabs/CustomerStatementTab";
import GovtFeesReportTab from "./tabs/GovtFeesReportTab";
import OutstandingReportTab from "./tabs/OutstandingReportTab";
import QuotationsReportTab from "./tabs/QuotationsReportTab";
import SalesReportTab from "./tabs/SalesReportTab";
import ServicePerformanceTab from "./tabs/ServicePerformanceTab";
import VatReportTab from "./tabs/VatReportTab";

const TABS = [
  { key: "sales", label: "Sales", component: SalesReportTab },
  { key: "govt-fees", label: "Government Fees", component: GovtFeesReportTab },
  { key: "vat", label: "VAT Collected", component: VatReportTab },
  { key: "outstanding", label: "Outstanding / Aging", component: OutstandingReportTab },
  { key: "statement", label: "Customer Statement", component: CustomerStatementTab },
  { key: "service-performance", label: "Service Performance", component: ServicePerformanceTab },
  { key: "quotations", label: "Quotations", component: QuotationsReportTab },
  { key: "attendance", label: "Attendance Summary", component: AttendanceSummaryTab },
] as const;

export default function ReportsPage() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("sales");
  const ActiveComponent = TABS.find((t) => t.key === active)!.component;

  return (
    <div>
      <h1 className="no-print mb-4 text-xl font-semibold text-ink">Reports</h1>
      <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              active === t.key ? "border-b-2 border-accent text-accent" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface p-5">
        <ActiveComponent />
      </div>
    </div>
  );
}
