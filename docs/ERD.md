ERD sketch (initial)

Tables:
- institution(id, slug, name, domain, sso_issuer, sso_client_id, created_at)
- account(id, institution_id, email, full_name, role, oidc_sub, last_login_at, created_at)
- club(id, institution_id, slug, name, description, is_active, created_at)
- membership(id, account_id, club_id, role, joined_at)
- event(id, club_id, title, description, location, starts_at, ends_at, capacity, created_at)
- session(id, account_id, token_hash, expires_at, user_agent, ip, created_at)

Constraints:
- FK: all scoped to institution via club.institution_id/account.institution_id or derived
- Unique: (institution_id, slug), (club_id, account_id) for membership, (oidc_sub, institution_id)
- Enforce same-institution: membership joins club+account; queries must filter by institution
