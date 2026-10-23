# KIT LMS — API Integration Guide

For the backend developer connecting the LMS frontend to live services.

## Base URL

Set in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Production:

```
NEXT_PUBLIC_API_URL=https://api.kidsintech.school
```

All service files in `src/_lib/api/` use the shared `apiClient` from
`src/_lib/api/client.js`, which reads the base URL from this env var.

## Authentication

NextAuth (Credentials provider) owns the session. Configuration lives in
`src/_lib/auth/auth-options.js`. The `authorize()` callback hits
`POST {API_URL}/login` and expects this response shape:

Normal login:
```json
{
  "user": {
    "id": "u1",
    "email": "...",
    "name": "...",
    "role": "admin|instructor|student|parent",
    "admission_no": "KIT/26/001 | null",
    "language_preference": "en|ha"
  }
}
```

Force-reset (admin-provisioned first login):
```json
{
  "must_reset_password": true,
  "temp_token": "...",
  "user": { ... }
}
```

The token (if you return one) is stored in NextAuth's JWT and exposed via
`useSession()`. If you need it on outgoing requests, wire an interceptor:

```js
// src/_lib/api/client.js
apiClient.interceptors.request.use((config) => {
  const token = /* read from session — getSession() in client, or
                   server-side via getServerSession() */;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

## Removing MSW (when backend is ready)

1. Delete `src/_lib/mocks/`
2. Delete `src/instrumentation.js`
3. Remove `MSWProvider` from `src/app/layout.js` (the JSX wrapping, plus the import)
4. Delete `public/mockServiceWorker.js`
5. Optionally delete `src/_components/providers/MSWProvider.jsx`
6. Point `NEXT_PUBLIC_API_URL` at the real backend

The app will then talk directly to the real API.

## TODO markers

Stubbed flows are tagged with `// TODO: Remove mock — connect to live API`.
Find them with:

```
rg "TODO" src/_lib/api/
```

## Schema reference

All shared types are JSDoc typedefs in `src/_types/schema.js`. Field names
match the backend exactly — **do not rename**.

Critical fields:
- `users`: `{ id, role, email, language_preference }`
- `students`: `{ id, parent_id, name, age, programme_track }` (+ `admission_no` for the LMS extension)
- `courses`: `{ id, title, description, price, payment_type, instructor_id }`
- `modules`: `{ id, course_id, title, order_index }`
- `lessons`: `{ id, module_id, title, content_type, youtube_url, body_content, order_index }`
- `messages`: `{ id, sender_id, receiver_id, message, file_url, created_at }`
- `payments`: `{ id, parent_id, student_id, amount, type, status, paystack_ref, created_at }`

## Endpoint inventory

See each service file in `src/_lib/api/` for the exact URL and payload shape:

| File | Endpoints |
|---|---|
| `auth.js` | `POST /login`, `POST /forgot-password`, `POST /reset-password` |
| `students.js` | `GET /students/me`, `GET /students/:id/progress` |
| `parents.js` | `GET /parents/me`, `GET /parents/me/children`, `POST /students` |
| `instructor.js` | `GET /instructors/me`, `GET /instructors/me/courses`, `GET /instructors/me/students`, `GET /assignments/instructor`, `PUT /assignments/:id/feedback`, `POST /courses`, `POST /modules`, `POST /lessons`, `POST /quizzes`, `POST /assignments`, `PUT /assignments/:id` |
| `admin.js` | `GET /admin/stats`, `GET /admin/users`, `GET /admin/courses`, `GET /admin/analytics`, `GET /admin/payments`, `GET /admin/pending-enrollments`, `POST /admin/users/{deactivate,activate,assign-instructor}`, `POST /admin/users`, `GET /admin/next-admission-no`, `POST/PUT/DELETE /admin/courses/:id`, `POST /admin/courses/:id/{publish,unpublish}` |
| `courses.js` | `GET /courses`, `GET /courses/:id/modules` |
| `lessons.js` | `GET /lessons/:id`, `GET /modules/:id/lessons`, `POST /lessons/:id/complete`, `PUT /lessons/:id` |
| `chat.js` | `GET /conversations`, `GET /conversations/:id/messages`, `POST /messages`, `PUT /messages/read` |
| `payments.js` | `GET /payments`, `GET /payments/stats`, `GET /payments/:id/receipt`, `GET /subscriptions`, `POST /subscriptions/cancel`, `POST /paystack/initiate`, `POST /paystack/verify` |
| `notifications.js` | `GET /notifications`, `PUT /notifications/:id/read`, `POST /admin/notifications/send` |
| `settings.js` | `PUT /user/profile`, `PUT /user/password`, `PUT /user/language`, `PUT /user/notifications` |
