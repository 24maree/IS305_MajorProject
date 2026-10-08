// tests/campus.test.js
// Automated tests using the built-in Node.js test runner.   Run with:  npm test
// Every test that touches files uses a TEMPORARY folder, so the real data/ folder is never changed.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { User } = require("../src/User");
const { StudentRequester, StaffRequester, ServiceOfficer, Technician } = require("../src/UserRoles");
const { ServiceRequest } = require("../src/ServiceRequest");
const { ICTSupportRequest, MaintenanceRequest, CleaningRequest, GeneralServiceRequest } = require("../src/RequestTypes");
const { ServiceRequestFactory } = require("../src/ServiceRequestFactory");
const { ServiceRequestManager } = require("../src/ServiceRequestManager");
const { ReportService } = require("../src/ReportService");
const { createRepositories, ServiceRequestFileRepository, UserFileRepository } = require("../src/Repositories");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeTempFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "campus-test-"));
}

// A manager with one student, one staff member, one officer and two technicians.
function makeManager(options = {}) {
  const manager = new ServiceRequestManager(options);
  manager.registerUser(new StudentRequester("S1", "Mareerose", "Possi", "mp@example.com", "BIS", 3));
  manager.registerUser(new StudentRequester("S2", "John", "Kila", "jk@example.com", "BAcc", 2));
  manager.registerUser(new ServiceOfficer("O1", "Peter", "Wari", "pw@example.com", "Campus Services"));
  manager.registerUser(new Technician("T1", "Samuel", "Dagi", "sd@example.com", "Networks"));
  manager.registerUser(new Technician("T2", "Anna", "Mou", "am@example.com", "Electrical"));
  return manager;
}

function ictRequest(manager, id = "REQ001", userId = "S1", extra = {}) {
  return new ICTSupportRequest(
    { requestId: id, requester: manager.findUserById(userId), title: "Wi-Fi down", description: "Cannot connect", location: "Library", priority: "High", ...extra },
    { deviceType: "Laptop", systemName: "Wi-Fi", faultType: "No connection", networkImpact: "Local" }
  );
}

function maintenanceRequest(manager, id = "REQ002", userId = "S1", extra = {}) {
  return new MaintenanceRequest(
    { requestId: id, requester: manager.findUserById(userId), title: "Broken light", description: "Flickers", location: "Admin Block", priority: "Urgent", ...extra },
    { building: "Admin", roomNumber: "A12", hazardLevel: "High", equipmentAffected: "Light" }
  );
}

function cleaningRequest(manager, id = "REQ003", userId = "S2") {
  return new CleaningRequest(
    { requestId: id, requester: manager.findUserById(userId), title: "Spill", description: "Drink spill", location: "Cafeteria", priority: "Normal" },
    { cleaningArea: "Entrance", hygieneRisk: "Medium", serviceType: "Spill clean-up", preferredServiceTime: "Morning" }
  );
}

// Takes one request through the full workflow up to the given step.
function moveTo(manager, requestId, step) {
  const steps = ["review", "assign", "start", "resolve", "close"];
  const last = steps.indexOf(step);
  if (last >= 0) manager.reviewRequest(requestId, "O1", "High");
  if (last >= 1) manager.assignTechnician(requestId, "O1", "T1");
  if (last >= 2) manager.startWork(requestId, "T1");
  if (last >= 3) manager.resolveRequest(requestId, "T1", "Done");
  if (last >= 4) manager.closeRequest(requestId, "O1", "Verified");
}

// ===========================================================================
//                              PASS TESTS
// ===========================================================================
test("T01 valid User construction, getters, getFullName and displayInfo", () => {
  const user = new User("U1", " Mary ", "Kila", "mary@example.com", "Student");
  assert.strictEqual(user.userId, "U1");
  assert.strictEqual(user.firstName, "Mary"); // spaces trimmed
  assert.strictEqual(user.getFullName(), "Mary Kila");
  assert.ok(user.displayInfo().includes("Mary Kila"));
  assert.strictEqual(user.validate(), true);
});

test("T02 invalid User values are rejected (id, names, email, type)", () => {
  assert.throws(() => new User("", "A", "B", "a@b.com", "Student"), /User ID is required/);
  assert.throws(() => new User("U1", "", "B", "a@b.com", "Student"), /First name is required/);
  assert.throws(() => new User("U1", "A", "", "a@b.com", "Student"), /Last name is required/);
  assert.throws(() => new User("U1", "A", "B", "not-an-email", "Student"), /not valid/);
  assert.throws(() => new User("U1", "A", "B", "a@b.com", "Visitor"), /User type must be/);
});

test("T03 private fields cannot be changed from outside; setters are controlled", () => {
  const user = new User("U1", "A", "B", "a@b.com", "Student");
  assert.throws(() => { user.email = "bad"; }, /not valid/);
  user.email = "new@example.com";
  assert.strictEqual(user.email, "new@example.com");
  assert.strictEqual(user.userId, "U1");
  assert.strictEqual(Object.keys(user).length, 0); // no public data fields
});

test("T04 valid user registration adds the user", () => {
  const manager = new ServiceRequestManager();
  const user = new User("U1", "A", "B", "a@b.com", "Student");
  manager.registerUser(user);
  assert.strictEqual(manager.findUserById("U1"), user);
  assert.strictEqual(manager.getAllUsers().length, 1);
});

test("T05 duplicate user ID is rejected", () => {
  const manager = makeManager();
  assert.throws(
    () => manager.registerUser(new StudentRequester("S1", "Other", "Person", "o@example.com", "BIS", 1)),
    /already exists/
  );
  assert.strictEqual(manager.getAllUsers().length, 5);
});

test("T06 valid request submission is stored with status Submitted", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  const stored = manager.findRequestById("REQ001");
  assert.strictEqual(stored.status, "Submitted");
  assert.strictEqual(manager.getAllRequests().length, 1);
});

test("T07 duplicate request ID is rejected", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  assert.throws(() => manager.submitRequest(ictRequest(manager, "REQ001", "S2")), /already exists/);
  assert.strictEqual(manager.getAllRequests().length, 1);
});

test("T08 invalid category and invalid priority are rejected", () => {
  const manager = makeManager();
  const base = { requestId: "R", requester: manager.findUserById("S1"), title: "T", description: "D", location: "L" };
  assert.throws(() => new ServiceRequest({ ...base, category: "Gardening" }), /Unsupported category/);
  assert.throws(() => new ServiceRequest({ ...base, category: "ICT Support", priority: "Whenever" }), /Unsupported priority/);
  assert.throws(() => ServiceRequestFactory.createForCategory("Gardening", base, {}), /Unsupported category/);
});

test("T09 missing title or description is rejected", () => {
  const manager = makeManager();
  const base = { requestId: "R", requester: manager.findUserById("S1"), location: "L", category: "ICT Support" };
  assert.throws(() => new ServiceRequest({ ...base, title: "", description: "D" }), /title is required/);
  assert.throws(() => new ServiceRequest({ ...base, title: "T", description: "  " }), /description is required/);
});

test("T10 view requester records shows only that user's requests", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager, "REQ001", "S1"));
  manager.submitRequest(maintenanceRequest(manager, "REQ002", "S1"));
  manager.submitRequest(cleaningRequest(manager, "REQ003", "S2"));
  assert.deepStrictEqual(manager.getRequestsByUser("S1").map((r) => r.requestId), ["REQ001", "REQ002"]);
  assert.deepStrictEqual(manager.getRequestsByUser("S2").map((r) => r.requestId), ["REQ003"]);
});

test("T11 cancelling a Submitted request changes the status to Cancelled", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  manager.cancelRequest("REQ001", "S1");
  assert.strictEqual(manager.findRequestById("REQ001").status, "Cancelled");
});

test("T12 cancelling an already Cancelled request is rejected", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  manager.cancelRequest("REQ001", "S1");
  assert.throws(() => manager.cancelRequest("REQ001", "S1"), /already Cancelled/);
});

test("T13 another user cannot update or cancel my request", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  assert.throws(() => manager.updateRequest("REQ001", "S2", { title: "Hacked" }), /only update your own/);
  assert.throws(() => manager.cancelRequest("REQ001", "S2"), /only cancel your own/);
  assert.strictEqual(manager.findRequestById("REQ001").title, "Wi-Fi down");
  assert.strictEqual(manager.findRequestById("REQ001").status, "Submitted");
});

test("T14 owner can update a Submitted request, but not after it is Reviewed", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  manager.updateRequest("REQ001", "S1", { title: "Wi-Fi is down", priority: "Urgent" });
  assert.strictEqual(manager.findRequestById("REQ001").title, "Wi-Fi is down");
  assert.strictEqual(manager.findRequestById("REQ001").priority, "Urgent");
  assert.throws(() => manager.updateRequest("REQ001", "S1", { title: "" }), /title is required/);
  moveTo(manager, "REQ001", "review");
  assert.throws(() => manager.updateRequest("REQ001", "S1", { title: "Late" }), /Only Submitted requests/);
});

test("T15 search by ID or title, and summary by status", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  manager.submitRequest(maintenanceRequest(manager));
  manager.cancelRequest("REQ002", "S1");
  assert.deepStrictEqual(manager.searchRequests("wi-fi").map((r) => r.requestId), ["REQ001"]);
  assert.deepStrictEqual(manager.searchRequests("req002").map((r) => r.requestId), ["REQ002"]);
  assert.deepStrictEqual(manager.searchRequests("   "), []);
  const summary = manager.getRequestSummaryByStatus();
  assert.strictEqual(summary.Submitted, 1);
  assert.strictEqual(summary.Cancelled, 1);
  assert.strictEqual(summary.Closed, 0);
});

// ===========================================================================
//                              CREDIT TESTS
// ===========================================================================
test("T16 subclass constructors call super() (common data and role are set)", () => {
  const student = new StudentRequester("S9", "A", "B", "a@b.com", "BIS", 2);
  const tech = new Technician("T9", "A", "B", "a@b.com", "Networks");
  assert.ok(student instanceof User);
  assert.strictEqual(student.userType, "Student");
  assert.strictEqual(tech.userType, "Technician");
  assert.strictEqual(new StaffRequester("F1", "A", "B", "a@b.com", "Library").userType, "Staff");

  const manager = makeManager();
  const ict = ictRequest(manager);
  assert.ok(ict instanceof ServiceRequest);
  assert.strictEqual(ict.requestId, "REQ001");   // set by the ServiceRequest constructor
  assert.strictEqual(ict.category, "ICT Support"); // set automatically
  assert.strictEqual(ict.status, "Submitted");
});

test("T17 specialised fields are validated", () => {
  const manager = makeManager();
  const common = { requestId: "R1", requester: manager.findUserById("S1"), title: "T", description: "D", location: "L" };
  assert.throws(() => new ICTSupportRequest(common, { deviceType: "PC", systemName: "X", faultType: "Y", networkImpact: "Huge" }), /Network impact must be/);
  assert.throws(() => new ICTSupportRequest(common, { deviceType: "", systemName: "X", faultType: "Y", networkImpact: "None" }), /Device type is required/);
  assert.throws(() => new MaintenanceRequest(common, { building: "B", roomNumber: "1", hazardLevel: "Extreme", equipmentAffected: "E" }), /Hazard level must be/);
  assert.throws(() => new CleaningRequest(common, { cleaningArea: "A", hygieneRisk: "Low", serviceType: "S", preferredServiceTime: "Midnight" }), /Preferred service time must be/);
  assert.throws(() => new ICTSupportRequest(common), /specialised information/);
});

test("T18 only a Service Officer can review and assign a Technician", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  assert.throws(() => manager.reviewRequest("REQ001", "S1", "High"), /Only a Service Officer can review/);
  assert.throws(() => manager.reviewRequest("REQ001", "T1", "High"), /Only a Service Officer can review/);
  manager.reviewRequest("REQ001", "O1", "High");
  assert.throws(() => manager.assignTechnician("REQ001", "T1", "T1"), /Only a Service Officer can assign/);
  assert.throws(() => manager.assignTechnician("REQ001", "O1", "S2"), /Only a Technician can be assigned/);
  manager.assignTechnician("REQ001", "O1", "T1");
  assert.strictEqual(manager.findRequestById("REQ001").assignedTechnicianId, "T1");
  assert.strictEqual(manager.findRequestById("REQ001").status, "Assigned");
});

test("T19 only the assigned Technician can start, update and resolve the work", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  moveTo(manager, "REQ001", "assign");
  assert.throws(() => manager.startWork("REQ001", "T2"), /Only the assigned Technician/);
  assert.throws(() => manager.startWork("REQ001", "O1"), /Only a Technician can/);
  manager.startWork("REQ001", "T1");
  assert.throws(() => manager.addProgressNote("REQ001", "T2", "hack"), /Only the assigned Technician/);
  manager.addProgressNote("REQ001", "T1", "Replaced cable");
  assert.throws(() => manager.resolveRequest("REQ001", "T2"), /Only the assigned Technician/);
  manager.resolveRequest("REQ001", "T1");
  assert.strictEqual(manager.findRequestById("REQ001").status, "Resolved");
});

test("T20 invalid status transitions are rejected", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  assert.throws(() => manager.assignTechnician("REQ001", "O1", "T1"), /Invalid status change: Submitted -> Assigned/);
  assert.throws(() => manager.closeRequest("REQ001", "O1"), /Invalid status change: Submitted -> Closed/);
  moveTo(manager, "REQ001", "assign");
  assert.throws(() => manager.resolveRequest("REQ001", "T1"), /Invalid status change: Assigned -> Resolved/);
  assert.throws(() => manager.cancelRequest("REQ001", "S1"), /Invalid status change: Assigned -> Cancelled/);
  assert.strictEqual(manager.findRequestById("REQ001").status, "Assigned");
});

test("T21 closed and cancelled are final; only a Service Officer closes a Resolved request", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  moveTo(manager, "REQ001", "resolve");
  assert.throws(() => manager.closeRequest("REQ001", "T1"), /Only a Service Officer can close/);
  manager.closeRequest("REQ001", "O1");
  assert.strictEqual(manager.findRequestById("REQ001").status, "Closed");
  assert.throws(() => manager.startWork("REQ001", "T1"), /final status/);
  assert.throws(() => manager.cancelRequest("REQ001", "S1"), /final status/);
});

test("T22 request history records every approved workflow action", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  moveTo(manager, "REQ001", "start");
  manager.addProgressNote("REQ001", "T1", "Replaced the cable");
  manager.resolveRequest("REQ001", "T1", "Done");
  manager.closeRequest("REQ001", "O1", "Verified");

  const history = manager.getRequestHistory("REQ001");
  assert.deepStrictEqual(
    history.map((h) => h.action),
    ["Submit Request", "Review Request", "Assign Technician", "Start Work", "Progress Update", "Resolve Request", "Close Request"]
  );
  assert.strictEqual(history[0].previousStatus, null);
  assert.strictEqual(history[0].newStatus, "Submitted");
  assert.strictEqual(history[2].previousStatus, "Reviewed");
  assert.strictEqual(history[2].newStatus, "Assigned");
  assert.strictEqual(history[4].comment, "Replaced the cable");
  assert.strictEqual(history[6].actorId, "O1");
  assert.strictEqual(history[6].actorRole, "Service Officer");
  assert.ok(history.every((h) => h.dateTime && h.comment !== undefined));
});

test("T23 failed workflow actions are NOT added to the history", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  assert.throws(() => manager.closeRequest("REQ001", "O1"));
  assert.throws(() => manager.reviewRequest("REQ001", "S1", "High"));
  assert.strictEqual(manager.getRequestHistory("REQ001").length, 1);
});

test("T24 specialised summaries show the correct information", () => {
  const manager = makeManager();
  const ict = ictRequest(manager).getRequestSummary();
  const maintenance = maintenanceRequest(manager).getRequestSummary();
  const cleaning = cleaningRequest(manager).getRequestSummary();
  assert.ok(ict.includes("Device     : Laptop") && ict.includes("Network    : Local impact"));
  assert.ok(maintenance.includes("Building   : Admin, Room A12") && maintenance.includes("Hazard     : High"));
  assert.ok(cleaning.includes("Area       : Entrance") && cleaning.includes("preferred time: Morning"));
  assert.ok(!ict.includes("Hazard"));
  assert.ok(!cleaning.includes("Device"));
});

test("T25 search, filter and sort return correct results", () => {
  let hour = 0;
  const clock = () => new Date(Date.UTC(2026, 8, 1, hour++));
  const manager = makeManager({ clock });
  manager.submitRequest(ictRequest(manager, "REQ001", "S1", { priority: "Low", dateSubmitted: "2026-09-01T01:00:00Z" }));
  manager.submitRequest(maintenanceRequest(manager, "REQ002", "S1")); // Urgent
  manager.submitRequest(cleaningRequest(manager, "REQ003", "S2"));    // Normal
  moveTo(manager, "REQ002", "assign");

  assert.deepStrictEqual(manager.filterByCategory("ICT Support").map((r) => r.requestId), ["REQ001"]);
  assert.deepStrictEqual(manager.filterByStatus("Assigned").map((r) => r.requestId), ["REQ002"]);
  assert.deepStrictEqual(manager.filterByPriority("Normal").map((r) => r.requestId), ["REQ003"]);
  assert.deepStrictEqual(manager.filterByTechnician("T1").map((r) => r.requestId), ["REQ002"]);
  // REQ002 was set to High during review, so the order is High, Normal, Low
  assert.deepStrictEqual(manager.sortByPriority(true).map((r) => r.requestId), ["REQ002", "REQ003", "REQ001"]);
  assert.deepStrictEqual(manager.sortByPriority(false).map((r) => r.requestId), ["REQ001", "REQ003", "REQ002"]);
});

test("T26 sorting by date submitted works in both directions", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager, "REQ001", "S1", { dateSubmitted: "2026-09-03T00:00:00Z" }));
  manager.submitRequest(maintenanceRequest(manager, "REQ002", "S1"));
  manager.findRequestById("REQ002"); // keep the default (today)
  manager.submitRequest(cleaningRequest(manager, "REQ003", "S2"));
  const oldest = manager.sortByDateSubmitted(false).map((r) => r.requestId);
  assert.strictEqual(oldest[0], "REQ001");
  const newest = manager.sortByDateSubmitted(true).map((r) => r.requestId);
  assert.strictEqual(newest[newest.length - 1], "REQ001");
});

// ===========================================================================
//                           DISTINCTION TESTS
// ===========================================================================
test("T27 polymorphism: the same calls give a different result for each request type", () => {
  const manager = makeManager();
  const requests = [
    ictRequest(manager),                                   // High (3), Local
    maintenanceRequest(manager),                           // Urgent (4), High hazard
    cleaningRequest(manager),                              // Normal (2), Medium risk
    new GeneralServiceRequest(
      { requestId: "REQ004", requester: manager.findUserById("S1"), title: "Chairs", description: "Need chairs", location: "Hall", priority: "Low" },
      { serviceType: "Furniture" }
    ),
  ];
  const scores = requests.map((r) => r.calculatePriorityScore());
  const hours = requests.map((r) => r.getTargetResolutionHours());
  assert.deepStrictEqual(scores, [40, 70, 28, 10]);
  assert.deepStrictEqual(hours, [24, 8, 24, 72]);
  const summaries = requests.map((r) => r.getRequestSummary());
  assert.strictEqual(new Set(summaries).size, 4);
});

test("T28 abstract-style base class throws a clear error for unimplemented methods", () => {
  const manager = makeManager();
  const plain = new ServiceRequest({
    requestId: "R1", requester: manager.findUserById("S1"), title: "T", description: "D", location: "L", category: "ICT Support",
  });
  assert.throws(() => plain.calculatePriorityScore(), /must implement calculatePriorityScore/);
  assert.throws(() => plain.getTargetResolutionHours(), /must implement getTargetResolutionHours/);
  assert.throws(() => plain.getRequestSummary(), /must implement getRequestSummary/);
});

test("T29 saving writes users, requests, history and audit JSON files", async () => {
  const folder = await makeTempFolder();
  const repos = createRepositories(folder);
  const manager = makeManager({ repos });
  manager.submitRequest(ictRequest(manager));
  moveTo(manager, "REQ001", "assign");
  await manager.save();

  const users = JSON.parse(await fs.readFile(path.join(folder, "users.json"), "utf8"));
  const requests = JSON.parse(await fs.readFile(path.join(folder, "serviceRequests.json"), "utf8"));
  const history = JSON.parse(await fs.readFile(path.join(folder, "requestHistory.json"), "utf8"));
  const audit = JSON.parse(await fs.readFile(path.join(folder, "auditLog.json"), "utf8"));
  assert.strictEqual(users.length, 5);
  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].requestType, "ICTSupportRequest");
  assert.strictEqual(requests[0].status, "Assigned");
  assert.strictEqual(requests[0].assignedTechnicianId, "T1");
  assert.strictEqual(history.length, 3);
  assert.ok(audit.length >= 8);
  assert.ok(!JSON.stringify(users).includes("password"));
  await fs.rm(folder, { recursive: true });
});

test("T30 loading restores the correct specialised objects and their behaviour", async () => {
  const folder = await makeTempFolder();
  const first = makeManager({ repos: createRepositories(folder) });
  first.submitRequest(ictRequest(first));
  first.submitRequest(maintenanceRequest(first));
  first.submitRequest(cleaningRequest(first));
  moveTo(first, "REQ001", "start");
  first.addProgressNote("REQ001", "T1", "Testing");
  await first.save();

  const second = new ServiceRequestManager({ repos: createRepositories(folder) });
  await second.load();
  assert.strictEqual(second.getAllUsers().length, 5);
  assert.ok(second.findUserById("T1") instanceof Technician);
  assert.ok(second.findUserById("S1") instanceof StudentRequester);

  assert.ok(second.findRequestById("REQ001") instanceof ICTSupportRequest);
  assert.ok(second.findRequestById("REQ002") instanceof MaintenanceRequest);
  assert.ok(second.findRequestById("REQ003") instanceof CleaningRequest);
  const ict = second.findRequestById("REQ001");
  assert.strictEqual(ict.status, "In Progress");
  assert.strictEqual(ict.assignedTechnicianId, "T1");
  assert.strictEqual(ict.calculatePriorityScore(), first.findRequestById("REQ001").calculatePriorityScore());
  assert.strictEqual(second.getRequestHistory("REQ001").length, 5);
  assert.strictEqual(second.getAuditLog().length, first.getAuditLog().length);

  // The restored objects still follow the rules.
  second.resolveRequest("REQ001", "T1", "Done");
  assert.throws(() => second.startWork("REQ001", "T1"), /Invalid status change/);
  await fs.rm(folder, { recursive: true });
});

test("T31 missing data files give empty arrays and the files are created", async () => {
  const folder = await makeTempFolder();
  const manager = new ServiceRequestManager({ repos: createRepositories(path.join(folder, "new-data")) });
  await manager.load();
  assert.strictEqual(manager.getAllUsers().length, 0);
  assert.strictEqual(manager.getAllRequests().length, 0);
  const created = await fs.readFile(path.join(folder, "new-data", "users.json"), "utf8");
  assert.deepStrictEqual(JSON.parse(created), []);
  await fs.rm(folder, { recursive: true });
});

test("T32 an empty data file is treated as no records", async () => {
  const folder = await makeTempFolder();
  await fs.writeFile(path.join(folder, "users.json"), "   \n", "utf8");
  const repo = new UserFileRepository(path.join(folder, "users.json"));
  assert.deepStrictEqual(await repo.loadAll(), []);
  await fs.rm(folder, { recursive: true });
});

test("T33 file-reading errors give a clear message (bad JSON, not an array)", async () => {
  const folder = await makeTempFolder();
  const file = path.join(folder, "serviceRequests.json");
  const repo = new ServiceRequestFileRepository(file);
  await fs.writeFile(file, "{ this is not json", "utf8");
  await assert.rejects(() => repo.loadAll(), /File read error .* not valid JSON/);
  await fs.writeFile(file, '{"a": 1}', "utf8");
  await assert.rejects(() => repo.loadAll(), /must contain a JSON array/);

  const manager = new ServiceRequestManager({ repos: createRepositories(folder) });
  await assert.rejects(() => manager.load(), /File read error/);
  await fs.rm(folder, { recursive: true });
});

test("T34 file-writing errors give a clear message", async () => {
  const folder = await makeTempFolder();
  const blocker = path.join(folder, "blocker");
  await fs.writeFile(blocker, "I am a file, not a folder", "utf8");
  const repo = new UserFileRepository(path.join(blocker, "users.json")); // folder path is really a file
  await assert.rejects(() => repo.saveAll([]), /File write error/);
  await assert.rejects(() => repo.saveAll("not an array"), /needs an array/);
  await fs.rm(folder, { recursive: true });
});

test("T35 repository methods: create, findById, findByRequester, findByTechnician, update", async () => {
  const folder = await makeTempFolder();
  const repo = new ServiceRequestFileRepository(path.join(folder, "r.json"));
  await repo.create({ requestId: "A", requesterId: "S1", assignedTechnicianId: "T1", status: "Submitted" });
  await repo.create({ requestId: "B", requesterId: "S2", assignedTechnicianId: null, status: "Submitted" });
  await assert.rejects(() => repo.create({ requestId: "A" }), /already exists/);
  assert.strictEqual((await repo.findById("B")).requesterId, "S2");
  assert.strictEqual(await repo.findById("Z"), null);
  assert.strictEqual((await repo.findByRequester("S1")).length, 1);
  assert.strictEqual((await repo.findByTechnician("T1")).length, 1);
  const updated = await repo.update("B", { status: "Cancelled" });
  assert.strictEqual(updated.status, "Cancelled");
  await assert.rejects(() => repo.update("Z", {}), /No record/);
  await fs.rm(folder, { recursive: true });
});

test("T36 invalid records are not stored or saved", async () => {
  const folder = await makeTempFolder();
  const manager = makeManager({ repos: createRepositories(folder) });
  assert.throws(() => manager.registerUser(new StudentRequester("S1", "Dup", "User", "d@example.com", "BIS", 1)));
  assert.throws(() => manager.submitRequest(ictRequest(manager, "REQ001", "S1", { title: "" })));
  // A requester who is not registered cannot submit.
  const stranger = new StudentRequester("S99", "Not", "Registered", "n@example.com", "BIS", 1);
  const strangerRequest = new ICTSupportRequest(
    { requestId: "REQ009", requester: stranger, title: "T", description: "D", location: "L" },
    { deviceType: "PC", systemName: "X", faultType: "Y", networkImpact: "None" }
  );
  assert.throws(() => manager.submitRequest(strangerRequest), /not registered/);
  await manager.save();
  const users = JSON.parse(await fs.readFile(path.join(folder, "users.json"), "utf8"));
  const requests = JSON.parse(await fs.readFile(path.join(folder, "serviceRequests.json"), "utf8"));
  assert.strictEqual(users.length, 5);
  assert.strictEqual(requests.length, 0);
  await fs.rm(folder, { recursive: true });
});

test("T37 factory rejects unknown request types and missing requesters", () => {
  const manager = makeManager();
  assert.throws(() => ServiceRequestFactory.createFromData({ requestType: "FoodRequest" }, manager.findUserById("S1")), /Unknown request type/);
  assert.throws(() => ServiceRequestFactory.createFromData(null, null), /missing/);
  const saved = ictRequest(manager).toData();
  assert.throws(() => ServiceRequestFactory.createFromData(saved, null), /Requester must be/);
  const restored = ServiceRequestFactory.createFromData(saved, manager.findUserById("S1"));
  assert.ok(restored instanceof ICTSupportRequest);
  assert.strictEqual(restored.networkImpact, "Local");
});

test("T38 audit log records successful and failed actions", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  assert.throws(() => manager.reviewRequest("REQ001", "S1", "High"));
  manager.reviewRequest("REQ001", "O1", "Urgent"); // priority changes High -> Urgent
  const log = manager.getAuditLog();
  const actions = log.map((e) => e.action);
  assert.ok(actions.includes("Register User"));
  assert.ok(actions.includes("Create Request"));
  assert.ok(actions.includes("Priority Change"));
  const denied = log.find((e) => e.actorId === "S1" && e.action === "Review Request");
  assert.ok(denied.result.startsWith("Failed"));
  const first = log[0];
  for (const field of ["auditId", "actorId", "action", "requestId", "description", "dateTime", "result"]) {
    assert.ok(field in first, `audit entry has ${field}`);
  }
  assert.strictEqual(new Set(log.map((e) => e.auditId)).size, log.length); // unique IDs
});

test("T39 report calculations are correct", () => {
  let now = new Date("2026-09-01T08:00:00Z");
  const clock = () => new Date(now);
  const manager = makeManager({ clock });
  manager.submitRequest(ictRequest(manager, "REQ001", "S1", { dateSubmitted: "2026-09-01T08:00:00Z" }));       // will be closed
  manager.submitRequest(maintenanceRequest(manager, "REQ002", "S1", { dateSubmitted: "2026-09-01T08:00:00Z" })); // Urgent
  manager.submitRequest(cleaningRequest(manager, "REQ003", "S2"));
  manager.cancelRequest("REQ003", "S2");

  now = new Date("2026-09-01T10:00:00Z");
  moveTo(manager, "REQ001", "start");
  now = new Date("2026-09-01T14:00:00Z"); // resolved 6 hours after submission
  manager.resolveRequest("REQ001", "T1", "Done");
  manager.closeRequest("REQ001", "O1", "Ok");

  now = new Date("2026-09-03T08:00:00Z"); // 48 hours after the maintenance request
  const reports = new ReportService(manager.getAllRequests(), clock);

  assert.deepStrictEqual(
    { s: reports.byStatus().Closed, c: reports.byStatus().Cancelled, u: reports.byStatus().Submitted },
    { s: 1, c: 1, u: 1 }
  );
  assert.strictEqual(reports.byCategory()["ICT Support"], 1);
  assert.strictEqual(reports.byCategory()["General Campus Service"], 0);
  assert.strictEqual(reports.byPriority().Urgent, 1);
  assert.deepStrictEqual(reports.urgentRequests().map((r) => r.requestId), ["REQ002"]);
  assert.deepStrictEqual(reports.overdueRequests().map((r) => r.requestId), ["REQ002"]); // 8 hour target, 48 hours old
  assert.deepStrictEqual(reports.assignedByTechnician(), { T1: 1 });
  assert.deepStrictEqual(reports.completedByTechnician(), { T1: 1 });
  assert.strictEqual(reports.averageResolutionHours(), 6);
  assert.deepStrictEqual(
    reports.volumeByLocation().map((v) => [v.location, v.total]),
    [["Admin Block", 1], ["Cafeteria", 1], ["Library", 1]]
  );
});

test("T40 average resolution time is 0 when nothing has been resolved", () => {
  const manager = makeManager();
  manager.submitRequest(ictRequest(manager));
  const reports = new ReportService(manager.getAllRequests());
  assert.strictEqual(reports.averageResolutionHours(), 0);
  assert.deepStrictEqual(reports.assignedByTechnician(), {});
});
