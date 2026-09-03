const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "juba-voting.db"));
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT UNIQUE,
  username TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('STUDENT','ADMIN')),
  faculty TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(election_id, name)
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  student_id TEXT,
  faculty TEXT,
  manifesto TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(election_id, position_id, voter_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || "CHANGE_THIS_IN_PRODUCTION",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function page(title, body, user = null) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Juba University</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="/">JU<span>Vote</span></a>
  <nav>
    ${user ? `<span class="user-pill">${esc(user.full_name)}</span><a href="/logout">Logout</a>` : `<a href="/login">Login</a>`}
  </nav>
</header>
<main class="container">${body}</main>
<footer>Juba University · Student Guild Election System</footer>
</body></html>`;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "ADMIN") return res.status(403).send(page("Forbidden", `<div class="card"><h1>403</h1><p>Administrator access required.</p></div>`, req.session.user));
  next();
}
function log(actor, action, details = "") {
  db.prepare("INSERT INTO audit_logs(actor_id, action, details) VALUES(?,?,?)").run(actor?.id || null, action, details);
}

app.get("/", (req, res) => {
  const user = req.session.user;
  const election = db.prepare("SELECT * FROM elections ORDER BY id DESC LIMIT 1").get();
  const positions = election ? db.prepare("SELECT * FROM positions WHERE election_id=? ORDER BY display_order,id").all(election.id) : [];
  const voted = user && election ? db.prepare("SELECT COUNT(*) n FROM votes WHERE election_id=? AND voter_id=?").get(election.id, user.id).n : 0;
  res.send(page("Home", `
<section class="hero">
  <div>
    <div class="eyebrow">JUBA UNIVERSITY</div>
    <h1>Student Guild<br><span>Election Portal</span></h1>
    <p>Secure, simple and transparent digital voting for the university community.</p>
    ${user ? (user.role === "ADMIN"
      ? `<a class="btn" href="/admin">Open Admin Dashboard</a>`
      : `<a class="btn" href="/vote">Go to Ballot</a>`)
      : `<a class="btn" href="/login">Sign in to Vote</a>`}
  </div>
  <div class="hero-card">
    <div class="status-dot"></div>
    <strong>${election ? esc(election.title) : "No election configured"}</strong>
    <p>${election ? esc(election.description || "") : "An administrator must configure an election."}</p>
    ${election ? `<div class="stats"><div><b>${positions.length}</b><small>Positions</small></div><div><b>${esc(election.status)}</b><small>Status</small></div>${user && user.role==="STUDENT" ? `<div><b>${voted}</b><small>Votes cast</small></div>` : ""}</div>` : ""}
  </div>
</section>
<section class="section">
  <h2>How it works</h2>
  <div class="grid3">
    <div class="card"><b>01 · Sign in</b><p>Use your university student account.</p></div>
    <div class="card"><b>02 · Review candidates</b><p>Read candidate profiles and manifestos before voting.</p></div>
    <div class="card"><b>03 · Submit ballot</b><p>Confirm your selections once. Your ballot is protected against duplicate submissions.</p></div>
  </div>
</section>
`, user));
});

app.get("/login", (req, res) => res.send(page("Login", `
<div class="auth-wrap"><div class="auth card">
<div class="eyebrow">UNIVERSITY ACCESS</div><h1>Sign in</h1>
<form method="post" action="/login">
<label>Account type<select name="role"><option value="STUDENT">Student</option><option value="ADMIN">Administrator</option></select></label>
<label>Student ID / Username<input name="identifier" required autocomplete="username"></label>
<label>Password<input type="password" name="password" required autocomplete="current-password"></label>
<button class="btn full">Sign in</button>
</form>
<p class="muted">Demo student: JU2026001 / Student@123</p>
<p class="muted">Demo admin: admin / Admin@123</p>
</div></div>
`)));

app.post("/login", (req, res) => {
  const { role, identifier, password } = req.body;
  const user = role === "ADMIN"
    ? db.prepare("SELECT * FROM users WHERE username=? AND role='ADMIN'").get(identifier)
    : db.prepare("SELECT * FROM users WHERE student_id=? AND role='STUDENT'").get(identifier);
  if (!user || user.status !== "ACTIVE" || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).send(page("Login failed", `<div class="card"><h2>Login failed</h2><p>Invalid account details.</p><a class="btn" href="/login">Try again</a></div>`));
  }
  req.session.user = { id:user.id, full_name:user.full_name, role:user.role, student_id:user.student_id, faculty:user.faculty };
  log(user, "LOGIN");
  res.redirect(user.role === "ADMIN" ? "/admin" : "/vote");
});

app.get("/logout", (req,res) => req.session.destroy(() => res.redirect("/")));

app.get("/vote", requireLogin, (req,res) => {
  if (req.session.user.role !== "STUDENT") return res.redirect("/admin");
  const election = db.prepare("SELECT * FROM elections ORDER BY id DESC LIMIT 1").get();
  if (!election) return res.send(page("Voting", `<div class="card"><h2>No election</h2><p>No election has been configured.</p></div>`, req.session.user));
  const now = Date.now(), start = new Date(election.start_at).getTime(), end = new Date(election.end_at).getTime();
  const open = election.status === "OPEN" && now >= start && now <= end;
  const positions = db.prepare("SELECT * FROM positions WHERE election_id=? ORDER BY display_order,id").all(election.id);
  const existing = db.prepare("SELECT position_id,candidate_id FROM votes WHERE election_id=? AND voter_id=?").all(election.id, req.session.user.id);
  const already = new Map(existing.map(v => [v.position_id,v.candidate_id]));

  if (!open) return res.send(page("Voting closed", `<div class="card"><span class="badge">${esc(election.status)}</span><h1>${esc(election.title)}</h1><p>The ballot is not currently open.</p><p>${esc(election.start_at)} → ${esc(election.end_at)}</p><a class="btn" href="/results/${election.id}">View Results</a></div>`, req.session.user));

  if (existing.length >= positions.length && positions.length) return res.send(page("Ballot submitted", `<div class="success card"><h1>Ballot submitted</h1><p>Your ballot for <b>${esc(election.title)}</b> has already been recorded.</p><a class="btn" href="/results/${election.id}">View results</a></div>`, req.session.user));

  const blocks = positions.map((p,i) => {
    const candidates = db.prepare("SELECT * FROM candidates WHERE position_id=? AND status='ACTIVE' ORDER BY full_name").all(p.id);
    return `<section class="ballot-position"><div class="position-head"><span>0${i+1}</span><h2>${esc(p.name)}</h2></div>
    <div class="candidate-grid">${candidates.map(c => `<label class="candidate">
      <input type="radio" name="position_${p.id}" value="${c.id}" ${already.get(p.id)===c.id?"checked":""} required>
      <div class="avatar">${esc(c.full_name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase())}</div>
      <div><strong>${esc(c.full_name)}</strong><small>${esc(c.faculty || "")}</small><p>${esc(c.manifesto || "")}</p></div>
    </label>`).join("")}</div></section>`;
  }).join("");

  res.send(page("Cast your vote", `
<div class="page-title"><div class="eyebrow">ACTIVE ELECTION</div><h1>${esc(election.title)}</h1><p>${esc(election.description || "")}</p></div>
<form method="post" action="/vote" onsubmit="return confirm('Submit your ballot? You will not be able to change these selections.');">
<input type="hidden" name="election_id" value="${election.id}">
${blocks}
<div class="submit-bar"><p><b>Review carefully.</b> Your selections cannot be changed after submission.</p><button class="btn">Submit ballot</button></div>
</form>
`, req.session.user));
});

app.post("/vote", requireLogin, (req,res) => {
  if (req.session.user.role !== "STUDENT") return res.status(403).end();
  const election = db.prepare("SELECT * FROM elections WHERE id=?").get(Number(req.body.election_id));
  if (!election || election.status !== "OPEN") return res.status(400).send("Election is not open.");
  const positions = db.prepare("SELECT * FROM positions WHERE election_id=? ORDER BY id").all(election.id);
  const selections = [];
  for (const p of positions) {
    const candidateId = Number(req.body[`position_${p.id}`]);
    if (!candidateId) return res.status(400).send(`Missing selection for ${p.name}`);
    const candidate = db.prepare("SELECT * FROM candidates WHERE id=? AND position_id=? AND status='ACTIVE'").get(candidateId,p.id);
    if (!candidate) return res.status(400).send("Invalid candidate selection.");
    selections.push({positionId:p.id,candidateId});
  }
  const tx = db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) n FROM votes WHERE election_id=? AND voter_id=?").get(election.id, req.session.user.id).n;
    if (count > 0) throw new Error("BALLOT_ALREADY_SUBMITTED");
    const insert = db.prepare("INSERT INTO votes(election_id,position_id,candidate_id,voter_id) VALUES(?,?,?,?)");
    for (const s of selections) insert.run(election.id,s.positionId,s.candidateId,req.session.user.id);
    log(req.session.user, "CAST_BALLOT", `election=${election.id}`);
  });
  try { tx(); } catch (e) {
    if (e.message === "BALLOT_ALREADY_SUBMITTED") return res.status(409).send(page("Already voted", `<div class="card"><h2>Ballot already submitted</h2><p>Your vote has already been recorded for this election.</p></div>`, req.session.user));
    throw e;
  }
  res.redirect(`/results/${election.id}`);
});

app.get("/results/:id", requireLogin, (req,res) => {
  const election = db.prepare("SELECT * FROM elections WHERE id=?").get(Number(req.params.id));
  if (!election) return res.status(404).send("Election not found");
  if (election.status !== "CLOSED" && req.session.user.role !== "ADMIN") return res.status(403).send(page("Results unavailable", `<div class="card"><h2>Results are not published yet.</h2></div>`, req.session.user));
  const positions = db.prepare("SELECT * FROM positions WHERE election_id=? ORDER BY display_order,id").all(election.id);
  const sections = positions.map(p => {
    const rows = db.prepare(`SELECT c.full_name, COUNT(v.id) votes FROM candidates c LEFT JOIN votes v ON v.candidate_id=c.id WHERE c.position_id=? GROUP BY c.id ORDER BY votes DESC,c.full_name`).all(p.id);
    const total = rows.reduce((s,r)=>s+r.votes,0);
    return `<section class="result card"><h2>${esc(p.name)}</h2>${rows.map(r=>`<div class="result-row"><div><strong>${esc(r.full_name)}</strong><small>${r.votes} vote${r.votes===1?"":"s"}</small></div><div class="bar"><i style="width:${total?Math.round(r.votes/total*100):0}%"></i></div><b>${total?Math.round(r.votes/total*100):0}%</b></div>`).join("")}<p class="muted">Total votes: ${total}</p></section>`;
  }).join("");
  res.send(page("Results", `<div class="page-title"><div class="eyebrow">ELECTION RESULTS</div><h1>${esc(election.title)}</h1></div>${sections}`, req.session.user));
});

app.get("/admin", requireAdmin, (req,res) => {
  const elections = db.prepare("SELECT * FROM elections ORDER BY id DESC").all();
  const students = db.prepare("SELECT COUNT(*) n FROM users WHERE role='STUDENT'").get().n;
  const votes = db.prepare("SELECT COUNT(*) n FROM votes").get().n;
  const latest = elections[0];
  res.send(page("Admin Dashboard", `
<div class="page-title"><div class="eyebrow">ADMINISTRATION</div><h1>Election dashboard</h1></div>
<div class="stats admin-stats"><div class="card"><b>${students}</b><small>Registered students</small></div><div class="card"><b>${votes}</b><small>Total votes</small></div><div class="card"><b>${elections.length}</b><small>Elections</small></div></div>
<div class="admin-grid">
<section class="card"><h2>Create election</h2><form method="post" action="/admin/elections">
<label>Title<input name="title" required value="Students' Guild Election 2026"></label>
<label>Description<textarea name="description">Juba University Student Guild election.</textarea></label>
<label>Start<input type="datetime-local" name="start_at" required></label>
<label>End<input type="datetime-local" name="end_at" required></label>
<button class="btn">Create draft</button></form></section>
<section class="card"><h2>Elections</h2>${elections.map(e=>`<div class="admin-item"><div><strong>${esc(e.title)}</strong><small>${esc(e.status)} · ${esc(e.start_at)} → ${esc(e.end_at)}</small></div><div class="actions">${e.status==="DRAFT"?`<form method="post" action="/admin/elections/${e.id}/open"><button>Open</button></form>`:""}${e.status==="OPEN"?`<form method="post" action="/admin/elections/${e.id}/close"><button>Close & publish</button></form>`:""}${e.status==="CLOSED"?`<a class="button" href="/results/${e.id}">Results</a>`:""}</div></div>`).join("")}</section>
</div>
${latest?`<section class="card"><h2>Manage latest election</h2><p>${esc(latest.title)}</p><div class="actions"><a class="button" href="/admin/elections/${latest.id}">Manage candidates & positions</a></div></section>`:""}
`, req.session.user));
});

app.post("/admin/elections", requireAdmin, (req,res) => {
  const {title,description,start_at,end_at}=req.body;
  const info=db.prepare("INSERT INTO elections(title,description,start_at,end_at) VALUES(?,?,?,?)").run(title,description,start_at,end_at);
  log(req.session.user,"CREATE_ELECTION",`election=${info.lastInsertRowid}`);
  res.redirect(`/admin/elections/${info.lastInsertRowid}`);
});

app.post("/admin/elections/:id/open", requireAdmin, (req,res) => {
  db.prepare("UPDATE elections SET status='OPEN' WHERE id=?").run(Number(req.params.id));
  log(req.session.user,"OPEN_ELECTION",`election=${req.params.id}`);
  res.redirect("/admin");
});
app.post("/admin/elections/:id/close", requireAdmin, (req,res) => {
  db.prepare("UPDATE elections SET status='CLOSED' WHERE id=?").run(Number(req.params.id));
  log(req.session.user,"CLOSE_ELECTION",`election=${req.params.id}`);
  res.redirect("/admin");
});

app.get("/admin/elections/:id", requireAdmin, (req,res) => {
  const id=Number(req.params.id);
  const election=db.prepare("SELECT * FROM elections WHERE id=?").get(id);
  if(!election) return res.status(404).send("Not found");
  const positions=db.prepare("SELECT * FROM positions WHERE election_id=? ORDER BY display_order,id").all(id);
  res.send(page("Manage Election", `
<div class="page-title"><div class="eyebrow">ADMIN</div><h1>${esc(election.title)}</h1></div>
<div class="admin-grid">
<section class="card"><h2>Add position</h2><form method="post" action="/admin/positions"><input type="hidden" name="election_id" value="${id}"><label>Position name<input name="name" required></label><label>Order<input type="number" name="display_order" value="0"></label><button class="btn">Add position</button></form></section>
<section class="card"><h2>Positions</h2>${positions.map(p=>`<div class="admin-item"><div><strong>${esc(p.name)}</strong><small>Position ID ${p.id}</small></div><a class="button" href="/admin/positions/${p.id}">Candidates</a></div>`).join("")}</section>
</div><a class="button" href="/admin">← Dashboard</a>
`,req.session.user));
});

app.post("/admin/positions", requireAdmin, (req,res) => {
  db.prepare("INSERT INTO positions(election_id,name,display_order) VALUES(?,?,?)").run(Number(req.body.election_id),req.body.name,Number(req.body.display_order)||0);
  res.redirect(`/admin/elections/${req.body.election_id}`);
});

app.get("/admin/positions/:id", requireAdmin, (req,res) => {
  const p=db.prepare("SELECT p.*,e.title FROM positions p JOIN elections e ON e.id=p.election_id WHERE p.id=?").get(Number(req.params.id));
  const candidates=db.prepare("SELECT * FROM candidates WHERE position_id=? ORDER BY full_name").all(p.id);
  res.send(page("Candidates", `
<div class="page-title"><div class="eyebrow">CANDIDATES</div><h1>${esc(p.name)}</h1><p>${esc(p.title)}</p></div>
<div class="admin-grid"><section class="card"><h2>Add candidate</h2><form method="post" action="/admin/candidates">
<input type="hidden" name="position_id" value="${p.id}">
<label>Full name<input name="full_name" required></label><label>Student ID<input name="student_id"></label><label>Faculty<input name="faculty"></label><label>Photo URL<input name="photo_url"></label><label>Manifesto<textarea name="manifesto"></textarea></label><button class="btn">Add candidate</button></form></section>
<section class="card"><h2>Registered candidates</h2>${candidates.map(c=>`<div class="admin-item"><div><strong>${esc(c.full_name)}</strong><small>${esc(c.student_id||"")} · ${esc(c.faculty||"")}</small></div><span class="badge">${esc(c.status)}</span></div>`).join("")}</section></div>
<a class="button" href="/admin/elections/${p.election_id}">← Positions</a>
`,req.session.user));
});

app.post("/admin/candidates", requireAdmin, (req,res) => {
  db.prepare("INSERT INTO candidates(position_id,full_name,student_id,faculty,manifesto,photo_url) VALUES(?,?,?,?,?,?)")
    .run(Number(req.body.position_id),req.body.full_name,req.body.student_id,req.body.faculty,req.body.manifesto,req.body.photo_url);
  res.redirect(`/admin/positions/${req.body.position_id}`);
});

app.get("/admin/audit", requireAdmin, (req,res) => {
  const rows=db.prepare(`SELECT a.*,u.full_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200`).all();
  res.send(page("Audit Log", `<div class="card"><h1>Audit log</h1>${rows.map(r=>`<div class="admin-item"><div><strong>${esc(r.action)}</strong><small>${esc(r.full_name||"System")} · ${esc(r.created_at)}</small></div><span>${esc(r.details||"")}</span></div>`).join("")}</div>`,req.session.user));
});

app.use((req,res)=>res.status(404).send(page("Not found", `<div class="card"><h1>404</h1><p>Page not found.</p><a class="btn" href="/">Home</a></div>`,req.session.user)));

app.listen(PORT, () => console.log(`Juba University Voting System running at http://localhost:${PORT}`));
