-- Remplacement atomique des compétences d'un collaborateur : suppression
-- et insertion dans la même transaction. Sans cela, une insertion en
-- échec (compétence inconnue...) laissait le collaborateur sans aucune
-- compétence.
create function replace_user_skills(p_user_id uuid, p_skills jsonb)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(p_skills) s
    where not exists (select 1 from skills where id = (s->>'skill_id')::uuid)
  ) then
    raise exception 'Compétence introuvable.' using errcode = 'P0002';
  end if;

  delete from user_skills where user_id = p_user_id;

  insert into user_skills (user_id, skill_id, proficiency_level, years_experience)
  select
    p_user_id,
    (s->>'skill_id')::uuid,
    (s->>'proficiency_level')::smallint,
    nullif(s->>'years_experience', '')::numeric
  from jsonb_array_elements(p_skills) s;
end;
$$;
