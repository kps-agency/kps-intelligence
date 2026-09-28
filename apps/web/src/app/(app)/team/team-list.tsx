"use client";

import { Badge, Card, CardContent, Input, Select, Skeleton } from "@kps/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrentUser } from "@/components/current-user-context";
import { useSkills, useTeam } from "@/lib/queries/team";
import { AVAILABILITY, roleLabel } from "@/lib/team-display";

const SKILLS_SHOWN = 5;

export function TeamList() {
  const { id: currentUserId } = useCurrentUser();
  const team = useTeam();
  const skills = useSkills();
  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");

  const members = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (team.data ?? []).filter(
      (m) =>
        (!term || m.fullName.toLowerCase().includes(term)) &&
        (!skillFilter || m.skills.some((s) => s.skillId === skillFilter)),
    );
  }, [team.data, search, skillFilter]);

  if (team.isPending) {
    return (
      <div role="status" aria-label="Chargement de l'équipe" className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (team.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Impossible de charger l&apos;équipe.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          placeholder="Rechercher un collaborateur..."
          aria-label="Rechercher un collaborateur"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          aria-label="Filtrer par compétence"
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="sm:max-w-xs"
        >
          <option value="">Toutes compétences</option>
          {skills.data?.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </Select>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun collaborateur ne correspond.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {members.map((member) => {
            const availability = member.availability ? AVAILABILITY[member.availability.status] : null;
            return (
              <li key={member.id}>
                <Card className="h-full">
                  <CardContent className="flex flex-col gap-2 pt-6 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">
                        <Link href={`/team/${member.id}`} className="text-primary underline-offset-4 hover:underline">
                          {member.fullName}
                        </Link>
                      </h2>
                      {member.id === currentUserId && <Badge variant="outline">Vous</Badge>}
                    </div>
                    <p className="text-muted-foreground">
                      {roleLabel(member.roleKey)}
                      {member.languages.length > 0 && ` · ${member.languages.join(", ").toUpperCase()}`}
                      {member.activeAssignments > 0 &&
                        ` · ${member.activeAssignments} demande${member.activeAssignments > 1 ? "s" : ""} en cours`}
                    </p>
                    <div>
                      {availability ? (
                        <Badge variant={availability.variant}>{availability.label}</Badge>
                      ) : (
                        <Badge variant="outline">Disponibilité non renseignée</Badge>
                      )}
                    </div>
                    {member.skills.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Principales compétences">
                        {member.skills.slice(0, SKILLS_SHOWN).map((skill) => (
                          <li key={skill.skillId}>
                            <Badge variant="secondary">
                              {skill.name} · {skill.proficiencyLevel}/5
                            </Badge>
                          </li>
                        ))}
                        {member.skills.length > SKILLS_SHOWN && (
                          <li className="text-xs text-muted-foreground">+{member.skills.length - SKILLS_SHOWN}</li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">Aucune compétence renseignée.</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
