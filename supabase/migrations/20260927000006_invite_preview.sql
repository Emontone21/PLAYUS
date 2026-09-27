-- Rediseño Frog · vista previa de la invitación
--
-- Quien abre un link de invitación todavía no es integrante y RLS no le deja
-- leer el grupo ni a su gente. invite_preview(code) devuelve lo mínimo para
-- mostrar "{A} y {B} ya están adentro": cuántos son y, de los primeros cinco
-- (por fecha de ingreso), el nombre en el grupo (apodo o display_name) y el
-- avatar. Nada de ids ni fechas. Un código inexistente devuelve lo mismo que
-- un grupo vacío ({ total: 0, members: [] }), sin un error distinto, para no
-- dar pistas (decisión 17).

create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_total int;
  v_members jsonb;
begin
  select g.id
    into v_group_id
    from public.groups g
   where g.invite_code = upper(btrim(coalesce(p_code, '')));

  if v_group_id is null then
    return jsonb_build_object('total', 0, 'members', '[]'::jsonb);
  end if;

  select count(*) into v_total from public.group_members m where m.group_id = v_group_id;

  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'avatar', x.avatar) order by x.joined_at), '[]'::jsonb)
    into v_members
    from (
      select coalesce(nullif(btrim(m.nickname), ''), p.display_name) as name, p.avatar, m.joined_at
        from public.group_members m
        join public.profiles p on p.id = m.profile_id
       where m.group_id = v_group_id
       order by m.joined_at
       limit 5
    ) x;

  return jsonb_build_object('total', v_total, 'members', v_members);
end;
$$;

comment on function public.invite_preview(text) is 'Vista previa de un link de invitación para quien todavía no es integrante: total y hasta 5 {name, avatar}. Código inexistente = grupo vacío.';

revoke execute on function public.invite_preview(text) from public, anon;
grant execute on function public.invite_preview(text) to authenticated;
