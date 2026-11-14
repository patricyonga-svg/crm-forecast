import { Suspense } from "react";
import { ReportTabs } from "@/components/ReportTabs";
import { SummarySwitch } from "@/components/SummarySwitch";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SummarySwitch />
      <Suspense>
        <ReportTabs />
      </Suspense>
      {children}
    </div>
  );
}
