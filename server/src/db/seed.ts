import type { Db } from "./index.js";

/**
 * Demo data so the app is usable the moment it starts: two universities, a
 * handful of clubs, a couple of members, and one event.
 *
 * Idempotent — every insert upserts or checks first, so it is safe to run on
 * each `npm run dev`. It never deletes anything.
 */

interface SeededInstitution {
  id: string;
  slug: string;
}

interface SeededClub {
  id: string;
  slug: string;
  institution_id: string;
}

interface SeededAccount {
  id: string;
  email: string;
}

export async function seed(db: Db): Promise<void> {
  const institutions = await db.query<SeededInstitution>(
    `INSERT INTO institution (slug, name, domain, sso_issuer, sso_client_id)
     VALUES ('uni-a', 'University A', 'uni-a.edu', 'http://localhost:3000/dev-idp', 'atlas-dev-client'),
            ('uni-b', 'University B', 'uni-b.edu', 'http://localhost:3000/dev-idp', 'atlas-dev-client')
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           domain = EXCLUDED.domain,
           sso_issuer = EXCLUDED.sso_issuer,
           sso_client_id = EXCLUDED.sso_client_id
     RETURNING id, slug`,
  );

  const bySlug = new Map(institutions.map((row) => [row.slug, row.id]));
  const uniA = bySlug.get("uni-a");
  const uniB = bySlug.get("uni-b");

  if (!uniA || !uniB) {
    throw new Error("Seed failed: institutions were not returned");
  }

  const accounts = await db.query<SeededAccount>(
    `INSERT INTO account (institution_id, email, full_name, oidc_sub)
     VALUES ($1, 'ada@uni-a.edu', 'Ada Lovelace', 'demo-ada'),
            ($1, 'grace@uni-a.edu', 'Grace Hopper', 'demo-grace'),
            ($2, 'bob@uni-b.edu', 'Bob Builder', 'demo-bob')
     ON CONFLICT (institution_id, oidc_sub) DO UPDATE
       SET email = EXCLUDED.email,
           full_name = EXCLUDED.full_name
     RETURNING id, email`,
    [uniA, uniB],
  );

  const accountByEmail = new Map(accounts.map((row) => [row.email, row.id]));

  const clubs = await db.query<SeededClub>(
    `INSERT INTO club (institution_id, slug, name, description)
     VALUES ($1, 'chess', 'Chess Society', 'Weekly games in the common room. All levels welcome.'),
            ($1, 'rowing', 'Rowing Club', 'Early mornings on the river, plus a novice intake each term.'),
            ($1, 'film', 'Film Society', 'Two screenings a week, chosen by members.'),
            ($2, 'debate', 'Debate Society', 'Weekly debates and inter-university competitions.'),
            ($2, 'robotics', 'Robotics Club', 'Build something that moves. Tools provided.')
     ON CONFLICT (institution_id, slug) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description
     RETURNING id, slug, institution_id`,
    [uniA, uniB],
  );

  const clubBySlug = new Map(clubs.map((row) => [row.slug, row]));

  const memberships: Array<[string | undefined, string | undefined, string]> = [
    ["ada@uni-a.edu", "chess", "officer"],
    ["ada@uni-a.edu", "film", "member"],
    ["grace@uni-a.edu", "chess", "member"],
    ["grace@uni-a.edu", "rowing", "member"],
    ["bob@uni-b.edu", "debate", "officer"],
    ["bob@uni-b.edu", "robotics", "member"],
  ];

  for (const [email, slug, role] of memberships) {
    const accountId = email ? accountByEmail.get(email) : undefined;
    const clubId = slug ? clubBySlug.get(slug)?.id : undefined;

    if (!accountId || !clubId) {
      continue;
    }

    await db.query(
      `INSERT INTO membership (account_id, club_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id, club_id) DO UPDATE SET role = EXCLUDED.role`,
      [accountId, clubId, role],
    );
  }

  const chess = clubBySlug.get("chess");
  if (chess) {
    await db.query(
      `INSERT INTO event (club_id, title, description, location, starts_at, ends_at, capacity)
       SELECT $1, 'Friday chess evening', 'Casual games and a short blitz tournament.',
              'Student Union, Room 2', now() + interval '2 days',
              now() + interval '2 days 3 hours', 30
        WHERE NOT EXISTS (
          SELECT 1 FROM event WHERE club_id = $1 AND title = 'Friday chess evening'
        )`,
      [chess.id],
    );
  }
}
