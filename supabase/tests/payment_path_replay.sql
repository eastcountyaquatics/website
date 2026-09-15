-- Replays exactly what stripe-webhook writes, against the real schema.
--
-- Why this exists: the payment path cannot be exercised end to end without
-- live Stripe keys and a real card. This closes the half that does not need
-- them -- every column name, status value, constraint and idempotency
-- guarantee the four handlers depend on. It catches the class of bug that
-- would otherwise first appear at 2am on a real family's payment: a renamed
-- column, a status value the check constraint rejects, an upsert whose
-- onConflict target has no unique index.
--
-- What it does NOT prove: that Stripe can reach the function, that the
-- signing secret is right, or that signature verification passes. Only a
-- real (or Stripe-CLI) delivery tests those.
--
-- Safe to run against production: everything happens inside a DO block that
-- ends in RAISE, so the transaction always rolls back. It reports by
-- throwing; read the message, not the exit status.
--
-- Run: paste into the Supabase SQL editor, or via the MCP execute_sql tool.
do $$
declare
  v_user uuid; v_a1 uuid; v_a2 uuid; v_opt uuid; v_opt2 uuid;
  v_tour uuid; v_inv uuid; v_sub uuid;
  n int; report text := '';
begin
  select id into v_user from public.profiles limit 1;
  if v_user is null then
    raise exception 'No profile exists to attach test rows to.';
  end if;

  insert into public.athletes (parent_id, full_name, birthdate, sex)
    values (v_user,'Replay Sib One','2012-01-01','Female') returning id into v_a1;
  insert into public.athletes (parent_id, full_name, birthdate, sex)
    values (v_user,'Replay Sib Two','2014-01-01','Male') returning id into v_a2;
  insert into public.registration_options (label, amount_cents, is_open, stripe_price_id)
    values ('Replay Fall 14U',45000,true,'price_replay_a') returning id into v_opt;
  insert into public.registration_options (label, amount_cents, is_open, stripe_price_id)
    values ('Replay Fall 10U',35000,true,'price_replay_b') returning id into v_opt2;
  insert into public.tournaments (name, event_date, is_published)
    values ('Replay Cup', current_date + 30, true) returning id into v_tour;
  insert into public.tournament_invites (tournament_id, athlete_id)
    values (v_tour, v_a1) returning id into v_inv;

  -- 1. Team registration (checkout.session.completed, default branch).
  begin
    insert into public.purchases (user_id, athlete_id, registration_option_id, description,
      amount_cents, currency, status, stripe_checkout_session_id, stripe_payment_intent_id,
      consent_responses)
    values
      (v_user,v_a1,v_opt, 'Replay Fall 14U - Sib One',45000,'usd','paid','cs_replay','pi_replay',
       '{"ball":true,"agreed_at":"2026-01-01T00:00:00Z"}'::jsonb),
      (v_user,v_a2,v_opt2,'Replay Fall 10U - Sib Two',35000,'usd','paid','cs_replay','pi_replay',null);
    report := report || 'T1 pass: multi-athlete cart writes both rows' || chr(10);
  exception when others then report := report || 'T1 FAIL: ' || SQLERRM || chr(10); end;

  -- 2. A duplicate delivery of that same event must be refused.
  begin
    insert into public.purchases (user_id, athlete_id, registration_option_id, description,
      amount_cents, currency, status, stripe_checkout_session_id, stripe_payment_intent_id)
    values (v_user,v_a1,v_opt,'Replay Fall 14U - Sib One',45000,'usd','paid','cs_replay','pi_replay');
    report := report || 'T2 FAIL: duplicate team payment accepted -- revenue would double-count' || chr(10);
  exception when unique_violation then
    report := report || 'T2 pass: duplicate team payment blocked by purchases_session_dedupe' || chr(10);
  end;

  -- 3. Tournament payment (null user_id, null registration_option_id).
  begin
    insert into public.purchases (user_id, athlete_id, tournament_id, tournament_invite_id,
      description, amount_cents, currency, status, stripe_checkout_session_id,
      stripe_payment_intent_id, payer_name, payer_email)
    values (null,v_a1,v_tour,v_inv,'Replay Cup - Sib One',8000,'usd','paid','cs_replay_t',
      'pi_replay_t','Replay Parent','replay@example.com');
    update public.tournament_invites set status='paid', paid_at=now() where id=v_inv;
    report := report || 'T3 pass: tournament purchase inserts and invite flips to paid' || chr(10);
  exception when others then report := report || 'T3 FAIL: ' || SQLERRM || chr(10); end;

  begin
    insert into public.purchases (user_id, athlete_id, tournament_id, tournament_invite_id,
      description, amount_cents, currency, status, stripe_checkout_session_id,
      stripe_payment_intent_id)
    values (null,v_a1,v_tour,v_inv,'Replay Cup - Sib One',8000,'usd','paid','cs_replay_t','pi_replay_t');
    report := report || 'T4 FAIL: duplicate tournament payment accepted' || chr(10);
  exception when unique_violation then
    report := report || 'T4 pass: duplicate tournament payment blocked' || chr(10);
  end;

  -- 4. Masters subscription created by checkout.
  begin
    insert into public.masters_subscriptions
      (user_id, tier, stripe_customer_id, stripe_subscription_id, status)
    values (v_user,'25_under','cus_replay','sub_replay','active')
    on conflict (stripe_subscription_id) do update set
      user_id=excluded.user_id, tier=excluded.tier, status=excluded.status
    returning id into v_sub;
    report := report || 'T5 pass: masters subscription upsert (onConflict target is unique)' || chr(10);
  exception when others then report := report || 'T5 FAIL: ' || SQLERRM || chr(10); end;

  -- 5. Every status mapSubscriptionStatus() can produce.
  begin
    update public.masters_subscriptions set status='paused'   where id=v_sub;
    update public.masters_subscriptions set status='canceled' where id=v_sub;
    update public.masters_subscriptions set status='past_due' where id=v_sub;
    update public.masters_subscriptions set status='pending'  where id=v_sub;
    update public.masters_subscriptions set status='active'   where id=v_sub;
    report := report || 'T6 pass: all mapSubscriptionStatus values accepted' || chr(10);
  exception when others then report := report || 'T6 FAIL: ' || SQLERRM || chr(10); end;

  -- 6. Monthly renewals: distinct charges land, a replayed one does not.
  begin
    insert into public.purchases (user_id,description,amount_cents,currency,status,stripe_payment_intent_id)
      values (v_user,'Masters Membership (25 & Under)',4500,'usd','paid','pi_replay_m1');
    insert into public.purchases (user_id,description,amount_cents,currency,status,stripe_payment_intent_id)
      values (v_user,'Masters Membership (25 & Under)',4500,'usd','paid','pi_replay_m2');
    report := report || 'T7 pass: two monthly renewals both recorded' || chr(10);
  exception when others then report := report || 'T7 FAIL: ' || SQLERRM || chr(10); end;

  begin
    insert into public.purchases (user_id,description,amount_cents,currency,status,stripe_payment_intent_id)
      values (v_user,'Masters Membership (25 & Under)',4500,'usd','paid','pi_replay_m1');
    report := report || 'T8 FAIL: duplicate Masters charge accepted';
  exception when unique_violation then
    report := report || 'T8 pass: duplicate Masters charge blocked by purchases_invoice_dedupe';
  end;

  raise exception E'\n%', report;  -- always rolls back
end $$;
