# Xenospace

Xenoware's internal team platform — the workspace for everyone. A MERN application combining team community, project & task management, a forum, knowledge base, and real-time communication.

This repository is being built in phases. **Phase 1 (Foundation)** is complete:
project scaffolding, authentication, RBAC, the main app shell/navigation, and the dashboard.

## Stack

- **Client**: React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, React Router, Zustand, Axios, React Hook Form + Zod
- **Server**: Node.js, Express 5, TypeScript, MongoDB + Mongoose, Socket.IO
- **Auth**: JWT access/refresh tokens in httpOnly cookies, bcrypt password hashing, RBAC middleware

## Project structure

```
xenospace/
├── client/   React app (features/, components/, layouts/, routes/, store/, services/)
└── server/   Express API (config/, controllers/, middleware/, models/, routes/, services/, validators/, sockets/)
```

## Getting started

### Prerequisites

- Node.js 20+
- A running MongoDB instance (local or Atlas)

### Backend

```bash
cd server
npm install
cp .env.example .env   # then fill in MONGO_URI and generate secrets, e.g. `openssl rand -hex 32`
npm run dev             # http://localhost:5000
```

### Frontend

```bash
cd client
npm install
npm run dev              # http://localhost:5173, proxies /api and /socket.io to :5000
```

Register an account, then check the server console — in development, verification/reset emails are logged to the console instead of sent (unless `SMTP_*` env vars are configured).

## Roles (RBAC)

`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `TEAM_LEAD`, `DEVELOPER`, `DESIGNER`, `MARKETING`, `INTERN`, `MEMBER` — new accounts always default to `MEMBER`; role changes must go through an admin (Phase 2: User Management).

## Roadmap

Phase 1 (this repo) covers the foundation. Team directory, forum, projects/tasks, real-time messaging, knowledge base/files, calendar, and admin analytics follow in later phases per the master development plan.
