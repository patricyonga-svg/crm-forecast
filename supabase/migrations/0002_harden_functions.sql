-- Durcissement signalé par les conseils de sécurité Supabase.

alter function touch_deal() set search_path = public;
alter function can_edit_deal(deals) set search_path = public;

-- Fonctions de déclencheur : jamais appelées directement.
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function log_change() from public, anon, authenticated;

-- Fonctions utilisées par les règles d'accès : réservées aux utilisateurs connectés.
revoke execute on function my_role() from public, anon;
revoke execute on function my_country() from public, anon;
revoke execute on function my_rep_ids() from public, anon;
grant execute on function my_role() to authenticated;
grant execute on function my_country() to authenticated;
grant execute on function my_rep_ids() to authenticated;
