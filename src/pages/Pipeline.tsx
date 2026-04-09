import { DashboardLayout } from "@/components/DashboardLayout";
import { Plus, MoreHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STAGES = [
  { key: "new",       label: "New Lead",       color: "border-blue-400" },
  { key: "contacted", label: "Contacted",       color: "border-yellow-400" },
  { key: "replied",   label: "Replied",         color: "border-green-400" },
  { key: "meeting",   label: "Meeting Booked",  color: "border-purple-400" },
  { key: "closed",    label: "Closed",          color: "border-primary" },
];

export default function Pipeline() {
  const qc = useQueryClient();

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", "", "all", 1],
    queryFn:  () => api.leads.list("", "all", 1),
  });

  const leads = leadsData?.leads ?? [];

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.leads.update(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leadsForStage = (key: string) =>
    leads.filter((l: any) => l.status === key);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">CRM Pipeline</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {leads.length} lead{leads.length !== 1 ? "s" : ""} across all stages
            </p>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const stageLeads = leadsForStage(stage.key);
            return (
              <div key={stage.key} className="min-w-[260px] flex-shrink-0 flex flex-col">
                {/* Column header */}
                <div className={`border-t-2 ${stage.color} glass-card rounded-t-none`}>
                  <div className="flex items-center justify-between p-3 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{stage.label}</h3>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        {stageLeads.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 min-h-[80px]">
                    {stageLeads.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        No leads
                      </p>
                    )}
                    {stageLeads.map((lead: any) => (
                      <div
                        key={lead.id}
                        className="bg-muted/40 hover:bg-muted/70 rounded-lg p-3 transition-colors cursor-default group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{lead.name}</p>
                            {lead.city && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {lead.city}
                              </p>
                            )}
                            {(lead.email || lead.phone) && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {lead.email || lead.phone}
                              </p>
                            )}
                          </div>

                          {/* Move dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <p className="text-xs text-muted-foreground px-2 py-1.5 font-medium">
                                Move to…
                              </p>
                              {STAGES.filter(s => s.key !== stage.key).map(s => (
                                <DropdownMenuItem
                                  key={s.key}
                                  onClick={() => moveMutation.mutate({ id: lead.id, status: s.key })}
                                >
                                  {s.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {lead.rating && (
                          <div className="flex items-center gap-1 mt-2">
                            <span className="text-primary text-xs">★</span>
                            <span className="text-xs text-muted-foreground">{lead.rating}</span>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1.5">{lead.source}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
