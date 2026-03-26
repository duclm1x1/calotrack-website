"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { BILLING_OFFERS } from "@/lib/billing";

interface PendingApproval {
  id: string;
  userName: string;
  telegramId: string;
  amount: number;
  transactionCode: string;
  screenshotUrl?: string;
  createdAt: string;
}

/**
 * Pending Approval Card Component
 */
function PendingApprovalCard({ 
  approval,
  onApprove,
  onReject 
}: { 
  approval: PendingApproval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    await onApprove(approval.id);
    setIsLoading(false);
  };

  const handleReject = async () => {
    setIsLoading(true);
    await onReject(approval.id);
    setIsLoading(false);
  };

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{approval.userName}</CardTitle>
            <p className="text-sm text-muted">@{approval.telegramId}</p>
          </div>
          <span className="text-2xl font-bold text-primary">
            {formatCurrency(approval.amount)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transaction Code */}
        <div>
          <p className="text-xs text-muted mb-1">Mã giao dịch</p>
          <code className="text-sm bg-zinc-800 px-2 py-1 rounded">{approval.transactionCode}</code>
        </div>

        {/* Screenshot */}
        {approval.screenshotUrl ? (
          <div>
            <p className="text-xs text-muted mb-1">Ảnh chứng minh</p>
            <div className="h-40 bg-zinc-800 rounded-lg flex items-center justify-center">
              <span className="text-muted">🖼️ [Preview ảnh]</span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-warning/10 rounded-lg">
            <p className="text-xs text-warning">⚠️ Không có ảnh chứng minh</p>
          </div>
        )}

        {/* Time */}
        <p className="text-xs text-muted">
          Yêu cầu lúc: {approval.createdAt}
        </p>
      </CardContent>
      <CardFooter className="gap-3">
        <Button 
          className="flex-1" 
          onClick={handleApprove}
          isLoading={isLoading}
        >
          ✅ Duyệt
        </Button>
        <Button 
          className="flex-1" 
          variant="destructive"
          onClick={handleReject}
          isLoading={isLoading}
        >
          ❌ Từ chối
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Pending Approvals Page
 * Critical admin page for manual bank transfer verification
 */
export default function PendingApprovalsPage() {
  // Mock data - will come from Supabase
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([
    {
      id: "1",
      userName: "Nguyễn Văn A",
      telegramId: "nguyenvana",
      amount: BILLING_OFFERS.monthly.priceVnd,
      transactionCode: "VCB20260118001234",
      screenshotUrl: "/mock.jpg",
      createdAt: "18/01/2026 14:30"
    },
    {
      id: "2",
      userName: "Trần Thị B",
      telegramId: "tranthib",
      amount: BILLING_OFFERS.lifetime.priceVnd,
      transactionCode: "MB20260118005678",
      createdAt: "18/01/2026 13:15"
    },
    {
      id: "3",
      userName: "Lê Văn C",
      telegramId: "levanc",
      amount: BILLING_OFFERS.monthly.priceVnd,
      transactionCode: "TCB20260118009012",
      screenshotUrl: "/mock.jpg",
      createdAt: "18/01/2026 10:45"
    },
  ]);

  const handleApprove = async (id: string) => {
    // TODO: Call API to approve
    // Simulate API call
    await new Promise(r => setTimeout(r, 500));
    // Remove from list
    setPendingApprovals(prev => prev.filter(a => a.id !== id));
  };

  const handleReject = async (id: string) => {
    // TODO: Call API to reject
    await new Promise(r => setTimeout(r, 500));
    setPendingApprovals(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chờ duyệt</h1>
          <p className="text-muted">
            {pendingApprovals.length > 0 
              ? `Có ${pendingApprovals.length} giao dịch cần xác nhận`
              : "Không có giao dịch nào cần duyệt"
            }
          </p>
        </div>
      </div>

      {/* Pending Cards Grid */}
      {pendingApprovals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingApprovals.map((approval) => (
            <PendingApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <span className="text-4xl mb-4 block">🎉</span>
          <p className="text-lg font-medium text-foreground">Tuyệt vời!</p>
          <p className="text-muted">Không có giao dịch nào cần duyệt.</p>
        </Card>
      )}
    </div>
  );
}
