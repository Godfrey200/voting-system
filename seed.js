const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const dir=path.join(__dirname,"data");
fs.mkdirSync(dir,{recursive:true});
const db=new Database(path.join(dir,"juba-voting.db"));
db.pragma("foreign_keys=ON");

const schema=`
CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT UNIQUE, username TEXT UNIQUE,
full_name TEXT NOT NULL, email TEXT, password_hash TEXT NOT NULL,
role TEXT NOT NULL CHECK(role IN ('STUDENT','ADMIN')), faculty TEXT,
status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS elections (
id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT,start_at TEXT NOT NULL,end_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'DRAFT');
CREATE TABLE IF NOT EXISTS positions (
id INTEGER PRIMARY KEY AUTOINCREMENT,election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,name TEXT NOT NULL,display_order INTEGER NOT NULL DEFAULT 0,UNIQUE(election_id,name));
CREATE TABLE IF NOT EXISTS candidates (
id INTEGER PRIMARY KEY AUTOINCREMENT,position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,full_name TEXT NOT NULL,student_id TEXT,faculty TEXT,manifesto TEXT,photo_url TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS votes (
id INTEGER PRIMARY KEY AUTOINCREMENT,election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(election_id,position_id,voter_id));
CREATE TABLE IF NOT EXISTS audit_logs (
id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`;
db.exec(schema);

const addUser=db.prepare(`INSERT OR IGNORE INTO users(student_id,username,full_name,email,password_hash,role,faculty) VALUES(?,?,?,?,?,?,?)`);
addUser.run("JU2026001",null,"Demo Student","student@jubauniversity.edu.ss",bcrypt.hashSync("Student@123",10),"STUDENT","Faculty of Computing");
addUser.run("JU2026002",null,"Amina Student","amina@jubauniversity.edu.ss",bcrypt.hashSync("Student@123",10),"STUDENT","Faculty of Business");
addUser.run(null,"admin","Election Administrator","admin@jubauniversity.edu.ss",bcrypt.hashSync("Admin@123",10),"ADMIN","Administration");

let election=db.prepare("SELECT * FROM elections ORDER BY id LIMIT 1").get();
if(!election){
  const now=new Date(), start=new Date(now.getTime()-60*60*1000), end=new Date(now.getTime()+24*60*60*1000);
  const info=db.prepare("INSERT INTO elections(title,description,start_at,end_at,status) VALUES(?,?,?,?,?)").run(
    "Students' Guild Election 2026",
    "Choose your student representatives for the Juba University Students' Guild.",
    start.toISOString().slice(0,16),
    end.toISOString().slice(0,16),
    "OPEN"
  );
  election={id:info.lastInsertRowid};
  const ip=db.prepare("INSERT INTO positions(election_id,name,display_order) VALUES(?,?,?)");
  ip.run(election.id,"Guild President",1);
  ip.run(election.id,"Vice President",2);
  ip.run(election.id,"Secretary General",3);

  const positions=db.prepare("SELECT * FROM positions WHERE election_id=? ORDER BY display_order").all(election.id);
  const ic=db.prepare("INSERT INTO candidates(position_id,full_name,student_id,faculty,manifesto) VALUES(?,?,?,?,?)");
  const names=[
    ["Daniel Lado","JU2026101","Faculty of Computing","A student-first guild focused on academic support, digital services and transparent representation."],
    ["Grace Nyandeng","JU2026102","Faculty of Business","Stronger student welfare, clubs and entrepreneurship opportunities."],
    ["James Wani","JU2026103","Faculty of Education","Better communication between students, faculties and university leadership."],
    ["Mary Adut","JU2026104","Faculty of Law","Inclusive student leadership and clear accountability."],
    ["Peter Deng","JU2026105","Faculty of Science","Modern student services and stronger academic communities."],
    ["Sarah Ajak","JU2026106","Faculty of Arts","A representative guild built around participation and student voice."]
  ];
  positions.forEach((p,i)=>names.slice(i*2,i*2+2).forEach(n=>ic.run(p.id,...n)));
}
console.log("Seed complete.");
console.log("Student: JU2026001 / Student@123");
console.log("Admin:   admin / Admin@123");
