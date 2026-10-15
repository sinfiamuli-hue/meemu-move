CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY,name TEXT,car TEXT,plate TEXT,pin TEXT,lat REAL,lng REAL,updated INTEGER,vtype TEXT,phone TEXT,island TEXT,role TEXT,licence_no TEXT,licence_exp TEXT,app_id TEXT);
CREATE TABLE IF NOT EXISTS rides(id TEXT PRIMARY KEY,rider TEXT,pn TEXT,plat REAL,plng REAL,dn TEXT,dlat REAL,dlng REAL,opt TEXT,fare INTEGER,status TEXT,driver_id TEXT,created INTEGER,vtype TEXT,sched INTEGER,note TEXT);
-- Drivers are added in /admin.html. The pin column stores a hash, never the PIN itself.
CREATE TABLE IF NOT EXISTS admin_fails(ip TEXT PRIMARY KEY,n INTEGER,t INTEGER);
-- SMS login
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY,hash TEXT,expires INTEGER,tries INTEGER,sent INTEGER,cnt INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,phone TEXT,created INTEGER);
-- Places for the booking dropdown, grouped by island. Riders only see places that have a location (set in /admin.html > Places).
-- Keep names unique across the atoll, so include the island name (for example "Veyvah Mosque").
CREATE TABLE IF NOT EXISTS places(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,lat REAL,lng REAL,sort INTEGER DEFAULT 0,island TEXT);
INSERT OR IGNORE INTO places(name,island,sort) VALUES
('Muli Airport (MUM)','Muli',1),('BML','Muli',2),('Muli Branch','Muli',3),('Raalhu Beach','Muli',4),('Muli Harbour','Muli',5),('Government Service Center - Meemu Atoll','Muli',6),('Muli Island Council','Muli',7),('Muli Police Station','Muli',8),('Mosque','Muli',9),
('Dhiggaru Harbour','Dhiggaru',20),('Maduvvari Harbour','Maduvvari',30),('Raiymandhoo Harbour','Raiymandhoo',40),('Veyvah Harbour','Veyvah',50),('Mulah Harbour','Mulah',60),('Naalaafushi Harbour','Naalaafushi',70),('Kolhufushi Harbour','Kolhufushi',80);
-- Ride types. mode 'land' = vehicles (same island), 'sea' = boats and vessels (between islands).
-- Fares are placeholders: set your real fares in /admin.html > Vehicles.
CREATE TABLE IF NOT EXISTS vtypes(id TEXT PRIMARY KEY,name TEXT,seats INTEGER,base REAL,per_km REAL,min_fare REAL,sort INTEGER DEFAULT 50,active INTEGER DEFAULT 1,mode TEXT DEFAULT 'land');
INSERT OR IGNORE INTO vtypes(id,name,seats,base,per_km,min_fare,sort,mode) VALUES
('bike','Two-wheeler',1,8,2.5,10,1,'land'),('tuk','Three-wheeler',3,10,3,12,2,'land'),('eco','Economy',4,12,3.5,15,3,'land'),('comfort','Comfort',4,17,5,21,4,'land'),('van','Van',6,23,6.5,29,5,'land'),
('speed','Speedboat',8,150,12,200,6,'sea'),('dhoni','Dhoni',12,100,8,150,7,'sea');
-- Driver and captain applications. Photos are small JPEGs stored as text. Only the admin can read them.
CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,role TEXT,name TEXT,phone TEXT,island TEXT,id_no TEXT,licence_no TEXT,licence_exp TEXT,vtype TEXT,make TEXT,plate TEXT,seats INTEGER,exp_years INTEGER,note TEXT,photo_person TEXT,photo_licence TEXT,photo_vehicle TEXT,status TEXT,reason TEXT,created INTEGER,decided INTEGER,driver_id TEXT,ip TEXT);
