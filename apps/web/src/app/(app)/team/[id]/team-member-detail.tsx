"use client";

import { REQUEST_STATUS_LABELS } from "@kps/shared";
import { AvailabilityStatus, type TeamMemberDetailResponse } from "@kps/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Textarea,
} from "@kps/ui";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/current-user-context";
import { ApiError } from "@/lib/api-client";
import {
  useCreateSkill,
  useSkills,
  useTeamMember,
  useUpdateAvailability,
  useUpdateTeamProfile,
  useUpdateTeamSkills,
} from "@/lib/queries/team";
import { AVAILABILITY, LEVEL_LABELS, roleLabel } from "@/lib/team-display";

const dateFormatter = new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium" });

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const messages = error.details.length > 0 ? error.details : [error.message];
  return (
    <ul role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

function Saved({ show }: { show: boolean }) {
  return show ? (
    <p role="status" className="text-sm text-success">
      Enregistré.
    </p>
  ) : null;
}

function AvailabilityEditor({ member }: { member: TeamMemberDetailResponse }) {
  const update = useUpdateAvailability(member.id);
  const [status, setStatus] = useState<AvailabilityStatus>(member.availability?.status ?? AvailabilityStatus.AVAILABLE);
  const [capacity, setCapacity] = useState(member.availability?.capacityHoursPerWeek?.toString() ?? "");
  const [from, setFrom] = useState(member.availability?.availableFrom ?? "");
  const [notes, setNotes] = useState(member.availability?.notes ?? "");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          status,
          capacityHoursPerWeek: capacity === "" ? null : Number(capacity),
          availableFrom: from || null,
          notes: notes || null,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="av-status">Statut</Label>
          <Select id="av-status" value={status} onChange={(e) => setStatus(e.target.value as AvailabilityStatus)}>
            {Object.values(AvailabilityStatus).map((s) => (
              <option key={s} value={s}>
                {AVAILABILITY[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="av-capacity">Heures disponibles / semaine</Label>
          <Input id="av-capacity" type="number" min={0} max={80} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="av-from">Disponible à partir du</Label>
          <Input id="av-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="av-notes">Précisions</Label>
        <Input id="av-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <ErrorMessage error={update.error} />
      <Saved show={update.isSuccess} />
      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Enregistrement..." : "Enregistrer la disponibilité"}
        </Button>
      </div>
    </form>
  );
}

function ProfileEditor({ member }: { member: TeamMemberDetailResponse }) {
  const update = useUpdateTeamProfile(member.id);
  const [languages, setLanguages] = useState(member.languages.join(", "));
  const [country, setCountry] = useState(member.country ?? "");
  const [timezone, setTimezone] = useState(member.timezone);
  const [expertise, setExpertise] = useState(member.expertise ?? "");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          languages: languages
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter(Boolean),
          country: country || null,
          timezone,
          expertise: expertise || null,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pr-languages">Langues parlées</Label>
          <Input
            id="pr-languages"
            aria-describedby="pr-languages-hint"
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
          />
          <p id="pr-languages-hint" className="text-xs text-muted-foreground">
            Codes à 2 lettres séparés par des virgules (fr, en, wo).
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pr-country">Pays</Label>
          <Input id="pr-country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pr-timezone">Fuseau horaire</Label>
          <Input id="pr-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pr-expertise">Expertise</Label>
        <Textarea id="pr-expertise" value={expertise} onChange={(e) => setExpertise(e.target.value)} />
      </div>
      <ErrorMessage error={update.error} />
      <Saved show={update.isSuccess} />
      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Enregistrement..." : "Enregistrer le profil"}
        </Button>
      </div>
    </form>
  );
}

type SkillDraft = { skillId: string; name: string; proficiencyLevel: number; yearsExperience: string };

function SkillsEditor({ member, canManageCatalogue }: { member: TeamMemberDetailResponse; canManageCatalogue: boolean }) {
  const catalogue = useSkills();
  const update = useUpdateTeamSkills(member.id);
  const createSkill = useCreateSkill();
  const [draft, setDraft] = useState<SkillDraft[]>([]);
  const [toAdd, setToAdd] = useState("");
  const [newSkill, setNewSkill] = useState("");

  useEffect(() => {
    setDraft(
      member.skills.map((s) => ({
        skillId: s.skillId,
        name: s.name,
        proficiencyLevel: s.proficiencyLevel,
        yearsExperience: s.yearsExperience?.toString() ?? "",
      })),
    );
  }, [member.skills]);

  const available = (catalogue.data ?? []).filter((s) => !draft.some((d) => d.skillId === s.id));

  return (
    <div className="grid gap-3">
      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune compétence renseignée.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {draft.map((skill, index) => (
            <li key={skill.skillId} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_10rem_7rem_auto]">
              <p className="self-center text-sm font-medium">{skill.name}</p>
              <div className="col-span-2 grid gap-1 sm:col-span-1">
                <Label htmlFor={`skill-${index}-level`} className="text-xs">
                  Niveau
                </Label>
                <Select
                  id={`skill-${index}-level`}
                  value={skill.proficiencyLevel}
                  onChange={(e) =>
                    setDraft(draft.map((d, i) => (i === index ? { ...d, proficiencyLevel: Number(e.target.value) } : d)))
                  }
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level} — {LEVEL_LABELS[level]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`skill-${index}-years`} className="text-xs">
                  Années
                </Label>
                <Input
                  id={`skill-${index}-years`}
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  value={skill.yearsExperience}
                  onChange={(e) =>
                    setDraft(draft.map((d, i) => (i === index ? { ...d, yearsExperience: e.target.value } : d)))
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer ${skill.name}`}
                onClick={() => setDraft(draft.filter((_, i) => i !== index))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="skill-add">Ajouter une compétence</Label>
          <Select id="skill-add" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            <option value="">Choisir…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.category ? `${s.category} — ` : ""}
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!toAdd}
          onClick={() => {
            const skill = catalogue.data?.find((s) => s.id === toAdd);
            if (!skill) return;
            setDraft([...draft, { skillId: skill.id, name: skill.name, proficiencyLevel: 3, yearsExperience: "" }]);
            setToAdd("");
          }}
        >
          Ajouter
        </Button>
      </div>

      <ErrorMessage error={update.error} />
      <Saved show={update.isSuccess} />
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              skills: draft.map((d) => ({
                skillId: d.skillId,
                proficiencyLevel: d.proficiencyLevel,
                yearsExperience: d.yearsExperience === "" ? null : Number(d.yearsExperience),
              })),
            })
          }
        >
          {update.isPending ? "Enregistrement..." : "Enregistrer les compétences"}
        </Button>
      </div>

      {canManageCatalogue && (
        <form
          className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newSkill.trim()) return;
            createSkill.mutate({ name: newSkill.trim(), category: null }, { onSuccess: () => setNewSkill("") });
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="skill-new">Compétence absente du catalogue</Label>
            <Input id="skill-new" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={createSkill.isPending || !newSkill.trim()}>
            Créer dans le catalogue
          </Button>
          <ErrorMessage error={createSkill.error} />
        </form>
      )}
    </div>
  );
}

export function TeamMemberDetail({ memberId }: { memberId: string }) {
  const currentUser = useCurrentUser();
  const member = useTeamMember(memberId);
  const canManage = currentUser.permissions.includes("team.manage");
  const canEdit = currentUser.id === memberId || canManage;

  if (member.isPending) {
    return (
      <div role="status" aria-label="Chargement du profil" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (member.isError) {
    const notFound = member.error instanceof ApiError && member.error.statusCode === 404;
    return (
      <p role="alert" className="text-sm text-destructive">
        {notFound ? "Ce collaborateur n'existe pas." : "Impossible de charger le profil."}
      </p>
    );
  }

  const data = member.data;
  const availability = data.availability ? AVAILABILITY[data.availability.status] : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/team" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Équipe
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{data.fullName}</h1>
          {availability ? (
            <Badge variant={availability.variant}>{availability.label}</Badge>
          ) : (
            <Badge variant="outline">Disponibilité non renseignée</Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {roleLabel(data.roleKey)}
          {data.country && ` · ${data.country}`}
          {data.languages.length > 0 && ` · ${data.languages.join(", ").toUpperCase()}`}
        </p>
        {data.expertise && <p className="mt-1 text-sm">{data.expertise}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Compétences</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <SkillsEditor member={data} canManageCatalogue={canManage} />
          ) : data.skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune compétence renseignée.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => (
                <li key={s.skillId}>
                  <Badge variant="secondary">
                    {s.name} · {LEVEL_LABELS[s.proficiencyLevel]}
                    {s.yearsExperience ? ` · ${s.yearsExperience} an${s.yearsExperience > 1 ? "s" : ""}` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Disponibilité</CardTitle>
            </CardHeader>
            <CardContent>
              <AvailabilityEditor member={data} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Profil</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileEditor member={data} />
            </CardContent>
          </Card>
        </>
      )}
      {!canEdit && data.availability && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Disponibilité</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data.availability.capacityHoursPerWeek !== null && <p>{data.availability.capacityHoursPerWeek} h / semaine</p>}
            {data.availability.availableFrom && (
              <p>À partir du {dateFormatter.format(new Date(data.availability.availableFrom))}</p>
            )}
            {data.availability.notes && <p className="text-muted-foreground">{data.availability.notes}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Historique de projets</CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune affectation pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {data.history.map((h) => (
                <li key={h.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/requests/${h.requestId}`} className="font-mono text-primary underline-offset-4 hover:underline">
                      {h.reference}
                    </Link>{" "}
                    {h.subject}
                    {h.serviceName && <span className="text-muted-foreground"> — {h.serviceName}</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {REQUEST_STATUS_LABELS[h.status]} · {dateFormatter.format(new Date(h.assignedAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
