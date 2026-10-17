API v1 (minimal)

Base: /api/v1

Auth required (session cookie) unless noted.

- GET /me
  -> { account: {..., role}, institution: {...} }

- GET /clubs
  -> { clubs: [...] } (institution-scoped)

- GET /clubs/:id
  -> { club: {..., members: [...] } }

- POST /clubs/:id/join (member)
- POST /clubs/:id/leave

- GET /events?clubId=...
  -> { events: [...] }

- POST /events (officer/admin) - create
- POST /events/:id/rsvp (member)

All list/get filtered by institution_id from session.
Never accept institution_id from client.
