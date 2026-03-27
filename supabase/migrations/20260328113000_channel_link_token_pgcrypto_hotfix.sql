begin;

create extension if not exists pgcrypto;

create or replace function public.ensure_channel_link_token(
  p_customer_id bigint,
  p_channel text default 'telegram',
  p_order_id bigint default null,
  p_ttl interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select link_token
    into v_token
  from public.channel_link_tokens
  where customer_id = p_customer_id
    and channel = coalesce(p_channel, 'telegram')
    and coalesce(order_id, -1) = coalesce(p_order_id, -1)
    and status = 'active'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(18), 'hex');

    insert into public.channel_link_tokens (
      customer_id,
      order_id,
      channel,
      link_token,
      status,
      expires_at
    )
    values (
      p_customer_id,
      p_order_id,
      coalesce(p_channel, 'telegram'),
      v_token,
      'active',
      now() + coalesce(p_ttl, interval '7 days')
    );
  end if;

  return v_token;
end;
$$;

notify pgrst, 'reload schema';

commit;
