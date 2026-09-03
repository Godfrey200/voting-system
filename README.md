# Juba University Voting System

A complete runnable Node.js + Express + SQLite student election application.

## Features

- Student login
- Admin login
- Election dashboard
- Candidate profiles
- Ballot with one vote per position
- Server-side eligibility and duplicate-vote protection
- Transactional vote submission
- Results dashboard
- Admin candidate management
- Admin election controls
- Audit log
- Responsive UI

## Requirements

- Node.js 20+ recommended
- npm

## Run

```bash
npm install
npm run seed
npm start
```

Open:

http://localhost:3000

## Demo accounts

Student:
- Student ID: `JU2026001`
- Password: `Student@123`

Admin:
- Username: `admin`
- Password: `Admin@123`

## Important

This is a development/demo system. Before a real university election, replace demo credentials, use HTTPS, configure secure session cookies, use a production database, integrate the university identity system, perform security testing, and have the election rules/audit process reviewed by the institution.
