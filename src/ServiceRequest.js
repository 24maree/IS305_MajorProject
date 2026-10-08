// ServiceRequest.js
// Base class for every service request.
// PASS:        private fields, validation, updateDetails(), cancelRequest(), summary.
// CREDIT:      controlled status workflow + request history array.
// DISTINCTION: "abstract-style" class. Three methods MUST be written by the
//              subclasses (ICT, Maintenance, Cleaning, General).

const { User } = require("./User");

const CATEGORIES = [
  "ICT Support",
  "Facilities Maintenance",
  "Cleaning and Sanitation",
  "General Campus Service",
];

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

const STATUSES = [
  "Submitted", "Reviewed", "Assigned", "In Progress", "Resolved", "Closed", "Cancelled",
];

// Which status can follow which. Cancelled and Closed are final (empty list).
const ALLOWED_TRANSITIONS = {
  "Submitted": ["Reviewed", "Cancelled"],
  "Reviewed": ["Assigned"],
  "Assigned": ["In Progress"],
  "In Progress": ["Resolved"],
  "Resolved": ["Closed"],
  "Closed": [],
  "Cancelled": [],
};

// Used to turn a priority word into a number for the priority score.
const PRIORITY_VALUES = { Low: 1, Normal: 2, High: 3, Urgent: 4 };

class ServiceRequest {
  // Private fields (encapsulation)
  #requestId;
  #requester;            // a User object (composition: a request HAS a requester)
  #title;
  #description;
  #location;
  #category;
  #priority;
  #status;
  #dateSubmitted;
  #dateUpdated;
  #assignedTechnicianId;
  #dateResolved;
  #history;              // array of history entries

  // commonData = { requestId, requester, title, description, location,
  //                category, priority, ... }
  constructor(commonData) {
    if (!commonData || typeof commonData !== "object") {
      throw new Error("Request data is required.");
    }
    const now = new Date();
    this.#requestId = ServiceRequest.checkText(commonData.requestId, "Request ID");
    this.#requester = ServiceRequest.checkRequester(commonData.requester);
    this.#title = ServiceRequest.checkText(commonData.title, "Request title");
    this.#description = ServiceRequest.checkText(commonData.description, "Request description");
    this.#location = ServiceRequest.checkText(commonData.location, "Campus location");
    this.#category = ServiceRequest.checkCategory(commonData.category);
    this.#priority = ServiceRequest.checkPriority(commonData.priority ?? "Normal");
    this.#status = ServiceRequest.checkStatus(commonData.status ?? "Submitted"); // default = Submitted
    this.#dateSubmitted = ServiceRequest.toDate(commonData.dateSubmitted ?? now, "Date submitted");
    this.#dateUpdated = ServiceRequest.toDate(commonData.dateUpdated ?? this.#dateSubmitted, "Date updated");
    this.#assignedTechnicianId = commonData.assignedTechnicianId ?? null;
    this.#dateResolved = commonData.dateResolved ? ServiceRequest.toDate(commonData.dateResolved, "Date resolved") : null;
    this.#history = Array.isArray(commonData.history) ? commonData.history.map((h) => ({ ...h })) : [];
  }

  // ===================== static checking helpers =====================
  static checkText(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label} is required.`);
    }
    return value.trim();
  }

  static checkRequester(value) {
    if (!(value instanceof User)) {
      throw new Error("Requester must be a registered User object.");
    }
    return value;
  }

  static checkCategory(value) {
    if (!CATEGORIES.includes(value)) {
      throw new Error(`Unsupported category "${value}". Allowed: ${CATEGORIES.join(", ")}.`);
    }
    return value;
  }

  static checkPriority(value) {
    if (!PRIORITIES.includes(value)) {
      throw new Error(`Unsupported priority "${value}". Allowed: ${PRIORITIES.join(", ")}.`);
    }
    return value;
  }

  static checkStatus(value) {
    if (!STATUSES.includes(value)) {
      throw new Error(`Unsupported status "${value}". Allowed: ${STATUSES.join(", ")}.`);
    }
    return value;
  }

  static toDate(value, label) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${label} is not a valid date.`);
    }
    return date;
  }

  // ===================== getters =====================
  get requestId() { return this.#requestId; }
  get requester() { return this.#requester; }
  get title() { return this.#title; }
  get description() { return this.#description; }
  get location() { return this.#location; }
  get category() { return this.#category; }
  get priority() { return this.#priority; }
  get status() { return this.#status; }
  get dateSubmitted() { return new Date(this.#dateSubmitted); }
  get dateUpdated() { return new Date(this.#dateUpdated); }
  get assignedTechnicianId() { return this.#assignedTechnicianId; }
  get dateResolved() { return this.#dateResolved ? new Date(this.#dateResolved) : null; }

  // ===================== controlled setters =====================
  // (There is NO public setter for status: it can only change through
  //  changeStatus(), which enforces the allowed workflow.)
  set title(value) { this.#title = ServiceRequest.checkText(value, "Request title"); }
  set description(value) { this.#description = ServiceRequest.checkText(value, "Request description"); }
  set location(value) { this.#location = ServiceRequest.checkText(value, "Campus location"); }
  set priority(value) { this.#priority = ServiceRequest.checkPriority(value); }
  set assignedTechnicianId(value) {
    this.#assignedTechnicianId = ServiceRequest.checkText(value, "Technician ID");
  }

  // ===================== validation =====================
  validate() {
    ServiceRequest.checkText(this.#requestId, "Request ID");
    ServiceRequest.checkRequester(this.#requester);
    ServiceRequest.checkText(this.#title, "Request title");
    ServiceRequest.checkText(this.#description, "Request description");
    ServiceRequest.checkText(this.#location, "Campus location");
    ServiceRequest.checkCategory(this.#category);
    ServiceRequest.checkPriority(this.#priority);
    ServiceRequest.checkStatus(this.#status);
    this.validateSpecialisedFields(); // subclasses add their own checks
    return true;
  }

  // Subclasses override this. The base class has no extra fields to check.
  validateSpecialisedFields() {
    return true;
  }

  // ===================== PASS: update and cancel =====================
  // changes can contain: title, description, location, priority.
  updateDetails(changes, actor = null, when = new Date()) {
    if (this.#status !== "Submitted") {
      throw new Error(`Only Submitted requests can be updated (this request is ${this.#status}).`);
    }
    if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
      throw new Error("No changes were provided.");
    }
    const allowed = ["title", "description", "location", "priority"];
    const unknown = Object.keys(changes).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`These fields cannot be updated: ${unknown.join(", ")}.`);
    }
    // Check every new value first, so we never save half of an update.
    if ("title" in changes) ServiceRequest.checkText(changes.title, "Request title");
    if ("description" in changes) ServiceRequest.checkText(changes.description, "Request description");
    if ("location" in changes) ServiceRequest.checkText(changes.location, "Campus location");
    if ("priority" in changes) ServiceRequest.checkPriority(changes.priority);
    // Now apply them using the setters.
    for (const key of Object.keys(changes)) {
      this[key] = changes[key];
    }
    this.#dateUpdated = new Date(when);
    if (actor) {
      this.recordHistory(this.#status, this.#status, "Update Details", actor,
        `Updated: ${Object.keys(changes).join(", ")}`, when);
    }
  }

  cancelRequest(actor, comment = "Cancelled by requester", when = new Date()) {
    if (this.#status === "Cancelled") {
      throw new Error(`Request ${this.#requestId} is already Cancelled.`);
    }
    this.changeStatus("Cancelled", actor, "Cancel Request", comment, when);
  }

  // ===================== CREDIT: controlled workflow =====================
  canChangeTo(newStatus) {
    return ALLOWED_TRANSITIONS[this.#status].includes(newStatus);
  }

  changeStatus(newStatus, actor, action, comment = "", when = new Date()) {
    ServiceRequest.checkStatus(newStatus);
    if (this.#status === "Cancelled" || this.#status === "Closed") {
      throw new Error(`Request ${this.#requestId} is ${this.#status} (a final status) and cannot be changed.`);
    }
    if (!this.canChangeTo(newStatus)) {
      throw new Error(`Invalid status change: ${this.#status} -> ${newStatus}.`);
    }
    const previous = this.#status;
    this.#status = newStatus;
    this.#dateUpdated = new Date(when);
    if (newStatus === "Resolved") {
      this.#dateResolved = new Date(when);
    }
    this.recordHistory(previous, newStatus, action, actor, comment, when);
  }

  // A technician can add progress notes while the work is In Progress.
  addProgressNote(note, actor, when = new Date()) {
    if (this.#status !== "In Progress") {
      throw new Error("Progress notes can only be added while the request is In Progress.");
    }
    const text = ServiceRequest.checkText(note, "Progress note");
    this.#dateUpdated = new Date(when);
    this.recordHistory("In Progress", "In Progress", "Progress Update", actor, text, when);
  }

  // ===================== CREDIT: request history =====================
  recordHistory(previousStatus, newStatus, action, actor, comment = "", when = new Date()) {
    this.#history.push({
      previousStatus,
      newStatus,
      action,
      actorId: actor ? actor.userId : "SYSTEM",
      actorRole: actor ? actor.userType : "System",
      comment,
      dateTime: new Date(when).toISOString(),
    });
  }

  getHistory() {
    return this.#history.map((entry) => ({ ...entry })); // copies, so outsiders cannot edit
  }

  // ===================== DISTINCTION: abstract-style methods =====================
  // The base class does NOT know how to do these. Subclasses must override them.
  calculatePriorityScore() {
    throw new Error(`${this.constructor.name} must implement calculatePriorityScore().`);
  }

  getTargetResolutionHours() {
    throw new Error(`${this.constructor.name} must implement getTargetResolutionHours().`);
  }

  getRequestSummary() {
    throw new Error(`${this.constructor.name} must implement getRequestSummary().`);
  }

  // ===================== helpers for subclasses =====================
  // The part of the summary that every request type shares.
  getCommonSummary() {
    const tech = this.#assignedTechnicianId ?? "Not assigned";
    return [
      `Request ID : ${this.#requestId}`,
      `Type       : ${this.constructor.name}`,
      `Title      : ${this.#title}`,
      `Requester  : ${this.#requester.getFullName()} (${this.#requester.userId})`,
      `Category   : ${this.#category}`,
      `Location   : ${this.#location}`,
      `Priority   : ${this.#priority}`,
      `Status     : ${this.#status}`,
      `Technician : ${tech}`,
      `Submitted  : ${this.#dateSubmitted.toISOString()}`,
    ];
  }

  // Number for the current priority word (Low=1 ... Urgent=4).
  getPriorityValue() {
    return PRIORITY_VALUES[this.#priority];
  }

  // Plain data for the JSON file. Subclasses add their own fields.
  // (History is saved separately in requestHistory.json.)
  toData() {
    return {
      requestId: this.#requestId,
      requestType: this.constructor.name,
      requesterId: this.#requester.userId,
      title: this.#title,
      description: this.#description,
      location: this.#location,
      category: this.#category,
      priority: this.#priority,
      status: this.#status,
      assignedTechnicianId: this.#assignedTechnicianId,
      dateSubmitted: this.#dateSubmitted.toISOString(),
      dateUpdated: this.#dateUpdated.toISOString(),
      dateResolved: this.#dateResolved ? this.#dateResolved.toISOString() : null,
    };
  }
}

module.exports = {
  ServiceRequest,
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  ALLOWED_TRANSITIONS,
};
