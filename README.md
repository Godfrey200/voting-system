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

## Procedures
## Docker Image BUild
<img width="959" height="545" alt="DockerImageBuild" src="https://github.com/user-attachments/assets/bc743c59-863c-4f55-a1fa-fd31f8a334da" />

## Docker Hub Images
<img width="941" height="552" alt="DockerHub-Images" src="https://github.com/user-attachments/assets/47c65cd7-9949-4023-b515-06437fb2c6d8" />

## Docker Running Containers
<img width="959" height="544" alt="RunningContainer" src="https://github.com/user-attachments/assets/172fdfd2-d0ed-4e74-ad0c-ddbe787b9272" />

## Docker live Web Application
<img width="956" height="589" alt="DockerWebApp" src="https://github.com/user-attachments/assets/bedc88df-8800-4375-9b23-37f6f5aa9d80" />

## Important

This is a development/demo system. Before a real university election, replace demo credentials, use HTTPS, configure secure session cookies, use a production database, integrate the university identity system, perform security testing, and have the election rules/audit process reviewed by the institution.
