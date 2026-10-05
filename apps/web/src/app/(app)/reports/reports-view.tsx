"use client";

import {
  MISSION_STATUS_LABELS,
  OPPORTUNITY_PIPELINE,
  OPPORTUNITY_STATUS_LABELS,
} from "@kps/shared";
import { MissionStatus, type OpportunityStatus, type ReportCount, type ReportOverviewResponse } from "@kps/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Skeleton } from "@kps/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError, apiFetch } from "@/lib/api-client";

// Une seule teinte pour toutes les séries : chaque graphique compare des
// grandeurs d'une même mesure, l'identité est portée par les libellés.
const SERIES = "hsl(221 83% 47%)";
const GRID = "hsl(214 32% 91%)";
const AXIS = "hsl(215 19% 35%)";

const MAX_PERIOD_DAYS = 366;
const PRESETS = [
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "12 mois", days: 365 },
];
const SOURCE_LABELS: Record<string, string> = {
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  WEBSITE: "Site web",
  MANUAL: "Saisie manuelle",
  API: "API",
};

const isoDate = (date: Date) => new Intl.DateTimeFormat("sv-SE").format(date);
const daysAgo = (days: number) => isoDate(new Date(Date.now() - (days - 1) * 86_400_000));
const shortDate = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short" });
const longDate = new Intl.DateTimeFormat("fr-CH", { dateStyle: "full" });
const number = new Intl.NumberFormat("fr-CH");
const percent = (value: number) => `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(value * 100)} %`;

function duration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${number.format(Math.round(hours * 10) / 10)} h`;
  return `${number.format(Math.round((hours / 24) * 10) / 10)} j`;
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border bg-card p-4 shadow-sm">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </li>
  );
}

// Chaque graphique a son tableau de données : lisible sans la vue, et
// par un lecteur d'écran.
function ChartCard({
  title,
  description,
  children,
  rows,
  columns,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  rows: (string | number)[][];
  columns: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          {title}
        </CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</p>
        ) : (
          <>
            {children}
            <details className="text-sm">
              <summary className="cursor-pointer text-primary underline-offset-4 hover:underline">
                Voir les données
              </summary>
              {/* Focalisable : une zone défilante doit rester atteignable au clavier. */}
              <div
                role="region"
                aria-label={`Données — ${title}`}
                tabIndex={0}
                className="mt-2 max-h-64 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <table className="w-full">
                  <caption className="sr-only">{title}</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      {columns.map((column, index) => (
                        <th key={column} scope="col" className={`pb-1 font-normal ${index > 0 ? "text-right" : ""}`}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={String(row[0])} className="border-t">
                        {row.map((cell, index) =>
                          index === 0 ? (
                            <th key={index} scope="row" className="py-1 text-left font-normal">
                              {cell}
                            </th>
                          ) : (
                            <td key={index} className="py-1 text-right tabular-nums">
                              {cell}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Barres horizontales en HTML : les libellés longs restent lisibles (en
// colonnes, sept étapes se chevauchent), valeur écrite au bout de chaque
// barre. Sert aux classements comme aux répartitions par étape.
function RankedBars({ data, total }: { data: ReportCount[]; total: number }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {data.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
          <span className="truncate" title={item.label}>
            {item.label}
          </span>
          <span aria-hidden="true" className="h-3">
            <span
              className="block h-full rounded-r"
              style={{
                width: item.count === 0 ? 0 : `${Math.max((item.count / max) * 100, 1.5)}%`,
                backgroundColor: SERIES,
              }}
            />
          </span>
          <span className="tabular-nums">
            {number.format(item.count)}
            {total > 0 && <span className="text-muted-foreground"> · {percent(item.count / total)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const tooltipStyle = {
  contentStyle: { borderRadius: 6, border: `1px solid ${GRID}`, fontSize: 13 },
  labelStyle: { color: "hsl(222 47% 11%)", fontWeight: 600 },
  itemStyle: { color: "hsl(222 47% 11%)" },
};

function Report({ report }: { report: ReportOverviewResponse }) {
  const { kpis, funnel } = report;
  const byDay = report.requestsByDay.map((d) => ({ ...d, short: shortDate.format(new Date(d.date)) }));
  const sources = report.requestsBySource.map((s) => ({ ...s, label: SOURCE_LABELS[s.label] ?? s.label }));
  const stageCount = (rows: ReportCount[], key: string) => rows.find((r) => r.label === key)?.count ?? 0;
  const stages = OPPORTUNITY_PIPELINE.map((status: OpportunityStatus) => ({
    label: OPPORTUNITY_STATUS_LABELS[status],
    count: stageCount(report.opportunitiesByStage, status),
  }));
  const missions = Object.values(MissionStatus).map((status) => ({
    label: MISSION_STATUS_LABELS[status],
    count: stageCount(report.missionsByStatus, status),
  }));
  const funnelSteps = [
    { label: "Demandes reçues", count: funnel.requests },
    { label: "Qualifiées", count: funnel.qualified },
    { label: "Devenues opportunités", count: funnel.opportunities },
    { label: "Gagnées", count: funnel.won },
  ];
  const hasAny = (rows: { count: number }[]) => rows.some((r) => r.count > 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="kpi-period" className="flex flex-col gap-2">
        <h2 id="kpi-period" className="text-sm font-semibold text-muted-foreground">
          Sur la période
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Demandes reçues" value={number.format(kpis.requestsInPeriod)} detail={`dont ${kpis.requestsToday} aujourd'hui`} />
          <Kpi label="Demandes qualifiées" value={number.format(kpis.qualifiedInPeriod)} />
          <Kpi
            label="Taux de qualification"
            value={kpis.qualificationRate === null ? "—" : percent(kpis.qualificationRate)}
            detail="demandes qualifiées / demandes reçues"
          />
          <Kpi
            label="Délai moyen de qualification"
            value={duration(kpis.avgHoursToQualify)}
            detail="de la réception à la qualification"
          />
        </ul>
      </section>
      <section aria-labelledby="kpi-now" className="flex flex-col gap-2">
        <h2 id="kpi-now" className="text-sm font-semibold text-muted-foreground">
          En ce moment
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Demandes à qualifier" value={number.format(kpis.toQualify)} />
          <Kpi label="Opportunités ouvertes" value={number.format(kpis.openOpportunities)} />
          <Kpi label="Missions actives" value={number.format(kpis.activeMissions)} detail="en cours ou bloquées" />
          <Kpi label="Nouveaux prospects" value={number.format(kpis.newProspects)} detail="fiches créées sur la période" />
        </ul>
      </section>

      <ChartCard
        title="Demandes reçues par jour"
        rows={kpis.requestsInPeriod === 0 ? [] : byDay.map((d) => [longDate.format(new Date(d.date)), d.count])}
        columns={["Jour", "Demandes"]}
      >
        <div className="h-64 w-full" role="img" aria-label="Courbe des demandes reçues par jour — détail dans « Voir les données »">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={byDay} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="short" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
                labelFormatter={(_, payload) => (payload[0] ? longDate.format(new Date(payload[0].payload.date)) : "")}
                formatter={(value) => [number.format(Number(value)), "Demandes"]}
                {...tooltipStyle}
              />
              <Line
                type="linear"
                dataKey="count"
                stroke={SERIES}
                strokeWidth={2}
                dot={byDay.length <= 31 ? { r: 3, fill: SERIES, stroke: "#fff", strokeWidth: 2 } : false}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Conversion"
          description="Parmi les demandes reçues sur la période, combien ont atteint chaque étape."
          rows={funnel.requests === 0 ? [] : funnelSteps.map((s) => [s.label, s.count, percent(s.count / funnel.requests)])}
          columns={["Étape", "Demandes", "Part"]}
        >
          <RankedBars data={funnelSteps} total={funnel.requests} />
        </ChartCard>
        <ChartCard
          title="Demandes par canal"
          rows={sources.map((s) => [s.label, s.count])}
          columns={["Canal", "Demandes"]}
        >
          <RankedBars data={sources} total={kpis.requestsInPeriod} />
        </ChartCard>
        <ChartCard
          title="Demandes par service"
          description="Service identifié par l'analyse de la demande."
          rows={report.requestsByService.map((s) => [s.label, s.count])}
          columns={["Service", "Demandes"]}
        >
          <RankedBars data={report.requestsByService} total={kpis.requestsInPeriod} />
        </ChartCard>
        <ChartCard
          title="Demandes par pays"
          rows={report.requestsByCountry.map((s) => [s.label, s.count])}
          columns={["Pays", "Demandes"]}
        >
          <RankedBars data={report.requestsByCountry.slice(0, 8)} total={kpis.requestsInPeriod} />
        </ChartCard>
        <ChartCard
          title="Opportunités par étape"
          description="État actuel du pipeline, toutes périodes confondues."
          rows={hasAny(stages) ? stages.map((s) => [s.label, s.count]) : []}
          columns={["Étape", "Opportunités"]}
        >
          <RankedBars data={stages} total={stages.reduce((sum, s) => sum + s.count, 0)} />
        </ChartCard>
        <ChartCard
          title="Missions par statut"
          description="État actuel, toutes périodes confondues."
          rows={hasAny(missions) ? missions.map((s) => [s.label, s.count]) : []}
          columns={["Statut", "Missions"]}
        >
          <RankedBars data={missions} total={missions.reduce((sum, s) => sum + s.count, 0)} />
        </ChartCard>
      </div>
    </div>
  );
}

export function ReportsView() {
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => isoDate(new Date()));
  // Mêmes règles que l'API : pas d'appel voué à un refus pendant que
  // l'utilisateur saisit ses dates.
  const ordered = from !== "" && to !== "" && from <= to;
  const tooLong = ordered && (Date.parse(to) - Date.parse(from)) / 86_400_000 >= MAX_PERIOD_DAYS;
  const valid = ordered && !tooLong;
  const report = useQuery({
    queryKey: ["reports", "overview", from, to] as const,
    queryFn: () => apiFetch<ReportOverviewResponse>(`/reports/overview?from=${from}&to=${to}`),
    enabled: valid,
    placeholderData: (previous) => previous,
  });
  const today = isoDate(new Date());

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div role="group" aria-label="Période prédéfinie" className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = to === today && from === daysAgo(preset.days);
              return (
                <Button
                  key={preset.days}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  aria-pressed={active}
                  onClick={() => {
                    setFrom(daysAgo(preset.days));
                    setTo(today);
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:ml-auto">
            <div className="grid gap-1.5">
              <Label htmlFor="report-from">Du</Label>
              <Input id="report-from" type="date" max={to} value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-to">Au</Label>
              <Input id="report-to" type="date" min={from} max={today} value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          {tooLong
            ? `La période ne peut pas dépasser ${MAX_PERIOD_DAYS} jours.`
            : "Choisissez une période dont le début précède la fin."}
        </p>
      )}
      {report.isError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {report.error instanceof ApiError ? report.error.message : "Impossible de charger le rapport."}
        </p>
      )}
      {valid && report.isPending && (
        <div role="status" aria-label="Chargement du rapport" className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      )}
      {report.data && <Report report={report.data} />}
    </div>
  );
}
