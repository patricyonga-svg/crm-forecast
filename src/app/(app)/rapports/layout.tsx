import { Suspense } from "react";
import { ReportTabs } from "@/components/ReportTabs";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Suspense>
        <ReportTabs />
      </Suspense>
      {children}
    </div>
  );
}
