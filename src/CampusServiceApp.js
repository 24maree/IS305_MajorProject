// CampusServiceApp.js
// The console menu. It only handles typing and printing.
// All rules live in ServiceRequestManager, and all file work lives in the repositories.
//
// Run it with:   node src/CampusServiceApp.js      (or: npm start)

const path = require("path");

const { USER_TYPES } = require("./User");
const { StudentRequester, StaffRequester, ServiceOfficer, Technician } = require("./UserRoles");
const { CATEGORIES, PRIORITIES, STATUSES } = require("./ServiceRequest");
const { NETWORK_IMPACTS, RISK_LEVELS, SERVICE_TIMES } = require("./RequestTypes");
const { ServiceRequestFactory } = require("./ServiceRequestFactory");
const { ServiceRequestManager } = require("./ServiceRequestManager");
const { ReportService } = require("./ReportService");
const { createRepositories } = require("./Repositories");
const { Prompter } = require("./Prompter");

// What to ask for each specialised field when a request is submitted.
const FIELD_INFO = {
  deviceType: { label: "Device type (e.g. Laptop)" },
  systemName: { label: "System name (e.g. Campus Wi-Fi)" },
  faultType: { label: "Fault type (e.g. Cannot connect)" },
  networkImpact: { label: "Network impact", options: NETWORK_IMPACTS },
  building: { label: "Building" },
  roomNumber: { label: "Room number" },
  hazardLevel: { label: "Hazard level", options: RISK_LEVELS },
  equipmentAffected: { label: "Equipment affected" },
  cleaningArea: { label: "Cleaning area" },
  hygieneRisk: { label: "Hygiene risk", options: RISK_LEVELS },
  serviceType: { label: "Service type" },
  preferredServiceTime: { label: "Preferred service time", options: SERVICE_TIMES },
};

const LINE = "============================================";

class CampusServiceApp {
  #manager;
  #prompter;
  #print;

  constructor(manager, prompter, print = console.log) {
    this.#manager = manager;
    this.#prompter = prompter;
    this.#print = print;
  }

  // ===================== main loop =====================
  async run() {
    this.#print("\nWelcome to the Campus Service Request System.");
    let running = true;
    while (running) {
      this.#showMainMenu();
      const choice = await this.#prompter.ask("Enter your choice: ");
      if (choice === null) { // input ended (for example the end of a piped file)
        break;
      }
      try {
        running = await this.#handleChoice(choice);
      } catch (error) {
        this.#print(`\nERROR: ${error.message}`);
      }
    }
    this.#print("\nGoodbye!");
  }

  // Returns false when the user chose Exit.
  async #handleChoice(choice) {
    const changesData = ["1", "2", "6", "7", "11", "12"]; // menu items that can change records
    switch (choice) {
      case "1": await this.#registerUser(); break;
      case "2": await this.#submitRequest(); break;
      case "3": await this.#viewRequestById(); break;
      case "4": await this.#viewMyRequests(); break;
      case "5": this.#printRequestList(this.#manager.getAllRequests(), "All requests"); break;
      case "6": await this.#updateMyRequest(); break;
      case "7": await this.#cancelMyRequest(); break;
      case "8": await this.#searchRequests(); break;
      case "9": this.#showStatusSummary(); break;
      case "10": return false;
      case "11": await this.#officerMenu(); break;
      case "12": await this.#technicianMenu(); break;
      case "13": await this.#filterAndSortMenu(); break;
      case "14": await this.#reportsMenu(); break;
      case "15": await this.#historyMenu(); break;
      default:
        this.#print("Please choose a number from the menu.");
    }
    if (changesData.includes(choice)) {
      await this.#saveData();
    }
    return true;
  }

  async #saveData() {
    try {
      await this.#manager.save();
    } catch (error) {
      this.#print(`WARNING: your data could not be saved. ${error.message}`);
    }
  }

  #showMainMenu() {
    this.#print(`
${LINE}
     CAMPUS SERVICE REQUEST SYSTEM
${LINE}
1. Register User
2. Submit Service Request
3. View Request by ID
4. View My Requests
5. View All Requests
6. Update My Request
7. Cancel My Request
8. Search Requests
9. View Request Summary
10. Exit
${LINE}
EXTENDED FEATURES
11. Service Officer Menu (review, assign, close)
12. Technician Menu (start, progress, resolve)
13. Filter and Sort Requests
14. Management Reports
15. History, Audit Log and Users
${LINE}`);
  }

  // ===================== small input helpers =====================
  async #ask(question) {
    return (await this.#prompter.ask(question)) ?? "";
  }

  // Shows a numbered list and returns the option the user picked.
  async #choose(title, options) {
    this.#print(`${title}:`);
    options.forEach((option, index) => this.#print(`  ${index + 1}. ${option}`));
    const answer = await this.#ask(`Choose 1-${options.length}: `);
    const chosen = options[Number(answer) - 1];
    if (!chosen) {
      throw new Error(`"${answer}" is not a valid choice.`);
    }
    return chosen;
  }

  #formatDate(date) {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }

  #printRequestList(requests, title) {
    this.#print(`\n${title} (${requests.length})`);
    if (requests.length === 0) {
      this.#print("  No requests found.");
      return;
    }
    this.#print("  ID      | Status      | Priority | Category                 | Title");
    this.#print("  --------+-------------+----------+--------------------------+----------------------");
    for (const r of requests) {
      this.#print(
        `  ${r.requestId.padEnd(7)} | ${r.status.padEnd(11)} | ${r.priority.padEnd(8)} | ${r.category.padEnd(24)} | ${r.title}`
      );
    }
  }

  #printCounts(title, counts) {
    this.#print(`\n${title}`);
    for (const [name, total] of Object.entries(counts)) {
      this.#print(`  ${name.padEnd(26)} : ${total}`);
    }
    if (Object.keys(counts).length === 0) {
      this.#print("  (none)");
    }
  }

  // ===================== 1. Register User =====================
  async #registerUser() {
    this.#print("\n--- Register User ---");
    const userId = await this.#ask("User ID (e.g. DWU2026001): ");
    const firstName = await this.#ask("First name: ");
    const lastName = await this.#ask("Last name: ");
    const email = await this.#ask("Email address: ");
    const userType = await this.#choose("User type", USER_TYPES);

    let user;
    if (userType === "Student") {
      const programme = await this.#ask("Programme (e.g. Bachelor of Information Systems): ");
      const year = await this.#ask("Year level (1-6): ");
      user = new StudentRequester(userId, firstName, lastName, email, programme, year);
    } else if (userType === "Staff") {
      const department = await this.#ask("Department: ");
      user = new StaffRequester(userId, firstName, lastName, email, department);
    } else if (userType === "Service Officer") {
      const section = await this.#ask("Service section: ");
      user = new ServiceOfficer(userId, firstName, lastName, email, section);
    } else {
      const speciality = await this.#ask("Technical speciality: ");
      user = new Technician(userId, firstName, lastName, email, speciality);
    }

    this.#manager.registerUser(user);
    this.#print(`\nSUCCESS: User registered.\n  ${user.displayInfo()}`);
  }

  // ===================== 2. Submit Service Request =====================
  async #submitRequest() {
    this.#print("\n--- Submit Service Request ---");
    const userId = await this.#ask("Your User ID: ");
    const requester = this.#manager.findUserById(userId);
    if (!requester) {
      throw new Error(`User "${userId}" is not registered. Use option 1 first.`);
    }
    const category = await this.#choose("Category", CATEGORIES);
    const title = await this.#ask("Request title: ");
    const description = await this.#ask("Description: ");
    const location = await this.#ask("Campus location (e.g. Library Level 2): ");
    const priority = await this.#choose("Priority", PRIORITIES);

    // Ask for the extra details that belong to this category.
    const specialisedData = {};
    for (const field of ServiceRequestFactory.getSpecialisedFields(category)) {
      const info = FIELD_INFO[field] ?? { label: field };
      specialisedData[field] = info.options
        ? await this.#choose(info.label, info.options)
        : await this.#ask(`${info.label}: `);
    }

    const request = ServiceRequestFactory.createForCategory(
      category,
      {
        requestId: this.#manager.generateRequestId(),
        requester,
        title,
        description,
        location,
        priority,
        dateSubmitted: new Date(),
      },
      specialisedData
    );
    this.#manager.submitRequest(request);
    this.#print(`\nSUCCESS: Request submitted with status "${request.status}".\n`);
    this.#print(request.getRequestSummary());
  }

  // ===================== 3, 4, 5. View =====================
  async #viewRequestById() {
    const requestId = await this.#ask("Request ID (e.g. REQ001): ");
    const request = this.#manager.findRequestById(requestId);
    if (!request) {
      throw new Error(`Request "${requestId}" was not found.`);
    }
    this.#print(`\n${request.getRequestSummary()}`);
  }

  async #viewMyRequests() {
    const userId = await this.#ask("Your User ID: ");
    if (!this.#manager.findUserById(userId)) {
      throw new Error(`User "${userId}" is not registered.`);
    }
    this.#printRequestList(this.#manager.getRequestsByUser(userId), `Requests for ${userId}`);
  }

  // ===================== 6. Update =====================
  async #updateMyRequest() {
    this.#print("\n--- Update My Request (only Submitted requests) ---");
    const userId = await this.#ask("Your User ID: ");
    const requestId = await this.#ask("Request ID: ");
    this.#print("Press Enter to keep the current value.");
    const changes = {};
    const title = await this.#ask("New title: ");
    const description = await this.#ask("New description: ");
    const location = await this.#ask("New location: ");
    const priorityText = await this.#ask("New priority (Low, Normal, High, Urgent): ");
    if (title) changes.title = title;
    if (description) changes.description = description;
    if (location) changes.location = location;
    if (priorityText) changes.priority = priorityText;

    const request = this.#manager.updateRequest(requestId, userId, changes);
    this.#print(`\nSUCCESS: Request ${request.requestId} updated.`);
  }

  // ===================== 7. Cancel =====================
  async #cancelMyRequest() {
    const userId = await this.#ask("Your User ID: ");
    const requestId = await this.#ask("Request ID to cancel: ");
    const request = this.#manager.cancelRequest(requestId, userId);
    this.#print(`\nSUCCESS: Request ${request.requestId} is now ${request.status}.`);
  }

  // ===================== 8. Search =====================
  async #searchRequests() {
    const text = await this.#ask("Search text (request ID or title): ");
    this.#printRequestList(this.#manager.searchRequests(text), `Search results for "${text}"`);
  }

  // ===================== 9. Summary =====================
  #showStatusSummary() {
    this.#printCounts("Request summary by status", this.#manager.getRequestSummaryByStatus());
  }

  // ===================== 11. Service Officer menu =====================
  async #officerMenu() {
    const officerId = await this.#ask("Your Service Officer ID: ");
    const action = await this.#choose("Officer action", [
      "Review a request and set its priority",
      "Assign a Technician",
      "Verify and close a Resolved request",
    ]);
    const requestId = await this.#ask("Request ID: ");

    if (action.startsWith("Review")) {
      const priority = await this.#choose("Priority", PRIORITIES);
      this.#manager.reviewRequest(requestId, officerId, priority);
      this.#print(`\nSUCCESS: ${requestId} is now Reviewed with priority ${priority}.`);
    } else if (action.startsWith("Assign")) {
      const technicianId = await this.#ask("Technician ID: ");
      this.#manager.assignTechnician(requestId, officerId, technicianId);
      this.#print(`\nSUCCESS: ${requestId} is now Assigned to ${technicianId}.`);
    } else {
      const comment = await this.#ask("Closing comment: ");
      this.#manager.closeRequest(requestId, officerId, comment || undefined);
      this.#print(`\nSUCCESS: ${requestId} is now Closed.`);
    }
  }

  // ===================== 12. Technician menu =====================
  async #technicianMenu() {
    const technicianId = await this.#ask("Your Technician ID: ");
    const action = await this.#choose("Technician action", [
      "View my assigned requests",
      "Start work",
      "Add a progress note",
      "Resolve the request",
    ]);

    if (action.startsWith("View")) {
      this.#printRequestList(this.#manager.filterByTechnician(technicianId), `Requests assigned to ${technicianId}`);
      return;
    }
    const requestId = await this.#ask("Request ID: ");
    if (action === "Start work") {
      this.#manager.startWork(requestId, technicianId);
      this.#print(`\nSUCCESS: ${requestId} is now In Progress.`);
    } else if (action.startsWith("Add")) {
      const note = await this.#ask("Progress note: ");
      this.#manager.addProgressNote(requestId, technicianId, note);
      this.#print("\nSUCCESS: Progress note saved in the request history.");
    } else {
      const comment = await this.#ask("Resolution comment: ");
      this.#manager.resolveRequest(requestId, technicianId, comment || undefined);
      this.#print(`\nSUCCESS: ${requestId} is now Resolved. A Service Officer must verify and close it.`);
    }
  }

  // ===================== 13. Filter and sort =====================
  async #filterAndSortMenu() {
    const option = await this.#choose("Filter or sort", [
      "Filter by category",
      "Filter by status",
      "Filter by priority",
      "Filter by assigned Technician",
      "Sort by date submitted (newest first)",
      "Sort by date submitted (oldest first)",
      "Sort by priority (highest first)",
    ]);
    if (option === "Filter by category") {
      const category = await this.#choose("Category", CATEGORIES);
      this.#printRequestList(this.#manager.filterByCategory(category), `Category: ${category}`);
    } else if (option === "Filter by status") {
      const status = await this.#choose("Status", STATUSES);
      this.#printRequestList(this.#manager.filterByStatus(status), `Status: ${status}`);
    } else if (option === "Filter by priority") {
      const priority = await this.#choose("Priority", PRIORITIES);
      this.#printRequestList(this.#manager.filterByPriority(priority), `Priority: ${priority}`);
    } else if (option === "Filter by assigned Technician") {
      const technicianId = await this.#ask("Technician ID: ");
      this.#printRequestList(this.#manager.filterByTechnician(technicianId), `Technician: ${technicianId}`);
    } else if (option.includes("newest")) {
      this.#printRequestList(this.#manager.sortByDateSubmitted(true), "Sorted by date (newest first)");
    } else if (option.includes("oldest")) {
      this.#printRequestList(this.#manager.sortByDateSubmitted(false), "Sorted by date (oldest first)");
    } else {
      this.#printRequestList(this.#manager.sortByPriority(true), "Sorted by priority (highest first)");
    }
  }

  // ===================== 14. Reports =====================
  async #reportsMenu() {
    const reports = new ReportService(this.#manager.getAllRequests());
    const option = await this.#choose("Management report", [
      "Requests grouped by status",
      "Requests grouped by category",
      "Requests grouped by priority",
      "Urgent requests",
      "Overdue requests",
      "Requests assigned to each Technician",
      "Completed requests by Technician",
      "Average resolution time",
      "Request volume by campus location",
      "Polymorphism demo (summary, score and target hours)",
    ]);
    switch (option) {
      case "Requests grouped by status":
        this.#printCounts("Requests by status", reports.byStatus()); break;
      case "Requests grouped by category":
        this.#printCounts("Requests by category", reports.byCategory()); break;
      case "Requests grouped by priority":
        this.#printCounts("Requests by priority", reports.byPriority()); break;
      case "Urgent requests":
        this.#printRequestList(reports.urgentRequests(), "Urgent requests (not closed or cancelled)"); break;
      case "Overdue requests":
        this.#printRequestList(reports.overdueRequests(), "Overdue requests"); break;
      case "Requests assigned to each Technician":
        this.#printCounts("Requests assigned to each Technician", reports.assignedByTechnician()); break;
      case "Completed requests by Technician":
        this.#printCounts("Completed requests by Technician", reports.completedByTechnician()); break;
      case "Average resolution time":
        this.#print(`\nAverage resolution time: ${reports.averageResolutionHours()} hours`); break;
      case "Request volume by campus location": {
        const volume = Object.fromEntries(reports.volumeByLocation().map((v) => [v.location, v.total]));
        this.#printCounts("Request volume by location", volume);
        break;
      }
      default:
        this.#polymorphismDemo();
    }
  }

  // The same three method calls work for every request type.
  #polymorphismDemo() {
    this.#print("\nPolymorphism: the same calls, a different result for each request type");
    for (const request of this.#manager.getAllRequests()) {
      this.#print(
        `  ${request.requestId.padEnd(7)} ${request.constructor.name.padEnd(22)}` +
        ` score = ${String(request.calculatePriorityScore()).padStart(3)}` +
        `   target = ${String(request.getTargetResolutionHours()).padStart(2)} hours`
      );
    }
  }

  // ===================== 15. History, audit log, users =====================
  async #historyMenu() {
    const option = await this.#choose("View", ["Request history", "Audit log (last 15 entries)", "Registered users"]);
    if (option === "Request history") {
      const requestId = await this.#ask("Request ID: ");
      const history = this.#manager.getRequestHistory(requestId);
      this.#print(`\nHistory of ${requestId}`);
      for (const h of history) {
        this.#print(
          `  ${h.dateTime.slice(0, 16).replace("T", " ")} | ${String(h.previousStatus ?? "-").padEnd(11)} -> ` +
          `${h.newStatus.padEnd(11)} | ${h.action} by ${h.actorId} (${h.actorRole}) | ${h.comment}`
        );
      }
    } else if (option.startsWith("Audit")) {
      const entries = this.#manager.getAuditLog().slice(-15);
      this.#print(`\nAudit log (showing ${entries.length} entries)`);
      for (const e of entries) {
        this.#print(
          `  ${e.auditId} | ${e.dateTime.slice(0, 16).replace("T", " ")} | ${e.actorId.padEnd(10)} | ` +
          `${e.action.padEnd(18)} | ${String(e.requestId ?? "-").padEnd(6)} | ${e.result}`
        );
      }
    } else {
      this.#print("\nRegistered users");
      for (const user of this.#manager.getAllUsers()) {
        this.#print(`  ${user.displayInfo()}`);
      }
    }
  }
}

// ===================== start the program =====================
async function main() {
  const dataFolder = process.env.CAMPUS_DATA_DIR || path.join(__dirname, "..", "data");
  const manager = new ServiceRequestManager({ repos: createRepositories(dataFolder) });
  try {
    await manager.load(); // read the JSON files
  } catch (error) {
    console.log(`\nERROR: ${error.message}`);
    console.log("Fix or delete the damaged file in the data folder, then start the program again.");
    process.exit(1);
  }
  const app = new CampusServiceApp(manager, new Prompter());
  await app.run();
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { CampusServiceApp };
