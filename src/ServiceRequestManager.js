// ServiceRequestManager.js
// The "brain" of the system. It keeps users and requests in JavaScript arrays and
// applies the rules (validation, role permissions, workflow, audit log).
//
// PASS:        register users, submit / find / update / cancel / search / summary.
// CREDIT:      review, assign, start, progress note, resolve, close, filters, sorting.
// DISTINCTION: audit log + load()/save() through repository classes (no direct file code here).

const { User } = require("./User");
const { createUserFromData } = require("./UserRoles");
const { ServiceRequest, STATUSES, PRIORITIES } = require("./ServiceRequest");
const { ServiceRequestFactory } = require("./ServiceRequestFactory");

class ServiceRequestManager {
  #users = [];
  #requests = [];
  #auditLog = [];
  #repos;   // { userRepo, requestRepo, historyRepo, auditRepo } or null (memory only)
  #clock;   // function that returns "now" (tests can replace it)

  constructor({ repos = null, clock = () => new Date() } = {}) {
    this.#repos = repos;
    this.#clock = clock;
  }

  // =====================================================================
  //                         USERS  (PASS)
  // =====================================================================
  registerUser(user) {
    return this.#perform(user?.userId ?? "UNKNOWN", "Register User", null, () => {
      if (!(user instanceof User)) {
        throw new Error("A User object is required.");
      }
      user.validate();
      if (this.findUserById(user.userId)) {
        throw new Error(`User ID "${user.userId}" already exists.`);
      }
      this.#users.push(user);
      return { result: user, description: `Registered ${user.getFullName()} as ${user.userType}.` };
    });
  }

  findUserById(userId) {
    return this.#users.find((u) => u.userId === userId) ?? null;
  }

  getAllUsers() {
    return [...this.#users];
  }

  // =====================================================================
  //                         REQUESTS  (PASS)
  // =====================================================================
  // Makes the next free ID: REQ001, REQ002, ...
  generateRequestId() {
    const numbers = this.#requests.map((r) => Number(r.requestId.replace(/\D/g, "")) || 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `REQ${String(next).padStart(3, "0")}`;
  }

  submitRequest(request) {
    return this.#perform(request?.requester?.userId ?? "UNKNOWN", "Create Request", request?.requestId ?? null, () => {
      if (!(request instanceof ServiceRequest)) {
        throw new Error("A ServiceRequest object is required.");
      }
      request.validate();
      if (this.findRequestById(request.requestId)) {
        throw new Error(`Request ID "${request.requestId}" already exists.`);
      }
      const requester = this.findUserById(request.requester.userId);
      if (!requester) {
        throw new Error(`Requester "${request.requester.userId}" is not registered.`);
      }
      if (requester.userType !== "Student" && requester.userType !== "Staff") {
        throw new Error("Only a Student or Staff requester can submit a request.");
      }
      if (request.status !== "Submitted") {
        throw new Error("A new request must have the status Submitted.");
      }
      this.#requests.push(request);
      request.recordHistory(null, "Submitted", "Submit Request", requester, "Request submitted", this.#clock());
      return { result: request, description: `Submitted "${request.title}" (${request.category}).` };
    });
  }

  findRequestById(requestId) {
    return this.#requests.find((r) => r.requestId === requestId) ?? null;
  }

  getRequestsByUser(userId) {
    return this.#requests.filter((r) => r.requester.userId === userId);
  }

  getAllRequests() {
    return [...this.#requests];
  }

  // A requester may update only their own Submitted request.
  updateRequest(requestId, userId, changes) {
    return this.#perform(userId, "Update Request", requestId, () => {
      const request = this.#needRequest(requestId);
      this.#needOwner(request, userId, "update");
      const actor = this.findUserById(userId);
      const oldPriority = request.priority;
      request.updateDetails(changes, actor, this.#clock());
      if (request.priority !== oldPriority) {
        this.#logAction(userId, "Priority Change", requestId, `Priority changed ${oldPriority} -> ${request.priority}.`, "Success");
      }
      return { result: request, description: `Updated: ${Object.keys(changes).join(", ")}.` };
    });
  }

  // A requester may cancel only their own Submitted request.
  cancelRequest(requestId, userId) {
    return this.#perform(userId, "Cancel Request", requestId, () => {
      const request = this.#needRequest(requestId);
      this.#needOwner(request, userId, "cancel");
      request.cancelRequest(this.findUserById(userId), "Cancelled by requester", this.#clock());
      return { result: request, description: "Request cancelled by the requester." };
    });
  }

  // Search by request ID or title (not case sensitive).
  searchRequests(searchText) {
    const text = String(searchText ?? "").trim().toLowerCase();
    if (text === "") {
      return [];
    }
    return this.#requests.filter(
      (r) => r.requestId.toLowerCase().includes(text) || r.title.toLowerCase().includes(text)
    );
  }

  // Example result: { Submitted: 3, Reviewed: 0, ... }
  getRequestSummaryByStatus() {
    const summary = {};
    for (const status of STATUSES) {
      summary[status] = this.#requests.filter((r) => r.status === status).length;
    }
    return summary;
  }

  // =====================================================================
  //                    ROLE WORKFLOW  (CREDIT)
  // =====================================================================
  // Service Officer reviews a Submitted request and sets its priority.
  reviewRequest(requestId, officerId, priority, comment = "Reviewed") {
    return this.#perform(officerId, "Review Request", requestId, () => {
      const officer = this.#needRole(officerId, "Service Officer", "review requests");
      const request = this.#needRequest(requestId);
      ServiceRequest.checkPriority(priority); // check BEFORE changing anything
      const oldPriority = request.priority;
      request.changeStatus("Reviewed", officer, "Review Request", `${comment} (priority ${priority})`, this.#clock());
      request.priority = priority;
      if (priority !== oldPriority) {
        this.#logAction(officerId, "Priority Change", requestId, `Priority changed ${oldPriority} -> ${priority}.`, "Success");
      }
      return { result: request, description: `Reviewed and set priority to ${priority}.` };
    });
  }

  // Service Officer assigns a Technician to a Reviewed request.
  assignTechnician(requestId, officerId, technicianId, comment = "Technician assigned") {
    return this.#perform(officerId, "Assign Technician", requestId, () => {
      const officer = this.#needRole(officerId, "Service Officer", "assign Technicians");
      const request = this.#needRequest(requestId);
      this.#needRole(technicianId, "Technician", "be assigned to a request");
      request.changeStatus("Assigned", officer, "Assign Technician", `${comment}: ${technicianId}`, this.#clock());
      request.assignedTechnicianId = technicianId;
      return { result: request, description: `Assigned to Technician ${technicianId}.` };
    });
  }

  // Only the assigned Technician can start the work.
  startWork(requestId, technicianId, comment = "Work started") {
    return this.#perform(technicianId, "Start Work", requestId, () => {
      const technician = this.#needAssignedTechnician(requestId, technicianId, "start the work");
      const request = this.#needRequest(requestId);
      request.changeStatus("In Progress", technician, "Start Work", comment, this.#clock());
      return { result: request, description: "Technician started the work." };
    });
  }

  // Only the assigned Technician can record progress.
  addProgressNote(requestId, technicianId, note) {
    return this.#perform(technicianId, "Progress Update", requestId, () => {
      const technician = this.#needAssignedTechnician(requestId, technicianId, "update the work progress");
      const request = this.#needRequest(requestId);
      request.addProgressNote(note, technician, this.#clock());
      return { result: request, description: `Progress note: ${note}` };
    });
  }

  // Only the assigned Technician can resolve the request.
  resolveRequest(requestId, technicianId, comment = "Work completed") {
    return this.#perform(technicianId, "Resolve Request", requestId, () => {
      const technician = this.#needAssignedTechnician(requestId, technicianId, "resolve the request");
      const request = this.#needRequest(requestId);
      request.changeStatus("Resolved", technician, "Resolve Request", comment, this.#clock());
      return { result: request, description: "Technician resolved the request." };
    });
  }

  // Only a Service Officer can verify and close a Resolved request.
  closeRequest(requestId, officerId, comment = "Verified and closed") {
    return this.#perform(officerId, "Close Request", requestId, () => {
      const officer = this.#needRole(officerId, "Service Officer", "close requests");
      const request = this.#needRequest(requestId);
      request.changeStatus("Closed", officer, "Close Request", comment, this.#clock());
      return { result: request, description: "Officer verified and closed the request." };
    });
  }

  // =====================================================================
  //                    FILTER AND SORT  (CREDIT)
  // =====================================================================
  filterByCategory(category) {
    return this.#requests.filter((r) => r.category === category);
  }

  filterByStatus(status) {
    return this.#requests.filter((r) => r.status === status);
  }

  filterByPriority(priority) {
    return this.#requests.filter((r) => r.priority === priority);
  }

  filterByTechnician(technicianId) {
    return this.#requests.filter((r) => r.assignedTechnicianId === technicianId);
  }

  // Both sort methods return a NEW sorted array (the original order is kept).
  sortByDateSubmitted(newestFirst = false) {
    const sorted = [...this.#requests].sort((a, b) => a.dateSubmitted - b.dateSubmitted);
    return newestFirst ? sorted.reverse() : sorted;
  }

  sortByPriority(highestFirst = true) {
    const rank = (r) => PRIORITIES.indexOf(r.priority);
    const sorted = [...this.#requests].sort((a, b) => rank(a) - rank(b)); // Low ... Urgent
    return highestFirst ? sorted.reverse() : sorted;
  }

  // =====================================================================
  //                    AUDIT LOG  (DISTINCTION)
  // =====================================================================
  getAuditLog() {
    return this.#auditLog.map((entry) => ({ ...entry }));
  }

  getRequestHistory(requestId) {
    const request = this.#needRequest(requestId);
    return request.getHistory();
  }

  // =====================================================================
  //                    SAVE AND LOAD  (DISTINCTION)
  // =====================================================================
  // Read all four JSON files (through the repositories) and rebuild the objects.
  async load() {
    if (!this.#repos) {
      throw new Error("No repositories were provided, so nothing can be loaded.");
    }
    const { userRepo, requestRepo, historyRepo, auditRepo } = this.#repos;
    const userData = await userRepo.loadAll();
    const requestData = await requestRepo.loadAll();
    const historyData = await historyRepo.loadAll();
    const auditData = await auditRepo.loadAll();

    const users = userData.map((data) => createUserFromData(data));

    const requests = requestData.map((data) => {
      const requester = users.find((u) => u.userId === data.requesterId);
      if (!requester) {
        throw new Error(`Saved request ${data.requestId} refers to unknown user "${data.requesterId}".`);
      }
      const history = historyData
        .filter((h) => h.requestId === data.requestId)
        .map(({ historyId, requestId, ...entry }) => entry); // keep only the history fields
      return ServiceRequestFactory.createFromData({ ...data, history }, requester);
    });

    // Only replace the memory after everything loaded without errors.
    this.#users = users;
    this.#requests = requests;
    this.#auditLog = auditData;
  }

  // Write all four JSON files. Called by the menu after every successful change.
  async save() {
    if (!this.#repos) {
      return; // memory-only mode (Pass level) - nothing to save
    }
    const { userRepo, requestRepo, historyRepo, auditRepo } = this.#repos;
    await userRepo.saveAll(this.#users.map((u) => u.toData()));
    await requestRepo.saveAll(this.#requests.map((r) => r.toData()));

    const historyRows = [];
    for (const request of this.#requests) {
      request.getHistory().forEach((entry, index) => {
        historyRows.push({
          historyId: `${request.requestId}-H${String(index + 1).padStart(2, "0")}`,
          requestId: request.requestId,
          ...entry,
        });
      });
    }
    await historyRepo.saveAll(historyRows);
    await auditRepo.saveAll(this.#auditLog);
  }

  // =====================================================================
  //                    PRIVATE HELPERS
  // =====================================================================
  // Runs one action. If it works, an audit entry says "Success".
  // If it throws, an audit entry says "Failed: reason" and the error is passed on.
  #perform(actorId, action, requestId, work) {
    try {
      const { result, description } = work();
      this.#logAction(actorId, action, requestId, description, "Success");
      return result;
    } catch (error) {
      this.#logAction(actorId, action, requestId, error.message, `Failed: ${error.message}`);
      throw error;
    }
  }

  #logAction(actorId, action, requestId, description, outcome) {
    const number = this.#auditLog.length + 1;
    this.#auditLog.push({
      auditId: `AUD${String(number).padStart(4, "0")}`,
      actorId,
      action,
      requestId,
      description,
      dateTime: this.#clock().toISOString(),
      result: outcome,
    });
  }

  #needRequest(requestId) {
    const request = this.findRequestById(requestId);
    if (!request) {
      throw new Error(`Request "${requestId}" was not found.`);
    }
    return request;
  }

  #needOwner(request, userId, verb) {
    if (request.requester.userId !== userId) {
      throw new Error(`You can only ${verb} your own requests.`);
    }
  }

  #needRole(userId, role, whatTheyMayDo) {
    const user = this.findUserById(userId);
    if (!user) {
      throw new Error(`User "${userId}" is not registered.`);
    }
    if (user.userType !== role) {
      throw new Error(`Only a ${role} can ${whatTheyMayDo}.`);
    }
    return user;
  }

  #needAssignedTechnician(requestId, technicianId, whatTheyMayDo) {
    const technician = this.#needRole(technicianId, "Technician", whatTheyMayDo);
    const request = this.#needRequest(requestId);
    if (request.assignedTechnicianId !== technicianId) {
      throw new Error(`Only the assigned Technician can ${whatTheyMayDo}.`);
    }
    return technician;
  }
}

module.exports = { ServiceRequestManager };
