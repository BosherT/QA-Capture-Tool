create table if not exists qa_capture_oauth_connections (
  id bigserial primary key,
  session_id text not null unique,
  atlassian_account_id text,
  display_name text,
  email text,
  cloud_id text,
  site_url text,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  expires_at timestamptz not null,
  sites_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz
);

create index if not exists qa_capture_oauth_connections_account_idx
  on qa_capture_oauth_connections (atlassian_account_id);

create index if not exists qa_capture_oauth_connections_cloud_idx
  on qa_capture_oauth_connections (cloud_id);
