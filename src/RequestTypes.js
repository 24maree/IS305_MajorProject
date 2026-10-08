// RequestTypes.js
// CREDIT:      four specialised request classes that INHERIT from ServiceRequest.
//              Each constructor calls super(commonRequestData) first (constructor chaining).
// DISTINCTION: each class OVERRIDES the three abstract-style methods, so the same
//              method call gives a different result for each request type (polymorphism).

const { ServiceRequest } = require("./ServiceRequest");

const NETWORK_IMPACTS = ["None", "Local", "Campus-Wide"];
const RISK_LEVELS = ["Low", "Medium", "High"];
const SERVICE_TIMES = ["Morning", "Afternoon", "Evening", "Anytime"];

// Small helpers so the subclasses stay short.
function tidy(value) {
  return typeof value === "string" ? value.trim() : value;
}

function needText(value, label) {
  return ServiceRequest.checkText(value, label);
}

function needOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function needSpecialisedData(data, className) {
  if (!data || typeof data !== "object") {
    throw new Error(`${className} needs its specialised information.`);
  }
  return data;
}

// ------------------------------------------------------------------
class ICTSupportRequest extends ServiceRequest {
  static SPECIALISED_FIELDS = ["deviceType", "systemName", "faultType", "networkImpact"];

  #deviceType;
  #systemName;
  #faultType;
  #networkImpact;

  constructor(commonRequestData, specialisedData) {
    super({ ...commonRequestData, category: "ICT Support" }); // constructor chaining
    const s = needSpecialisedData(specialisedData, "ICTSupportRequest");
    this.#deviceType = tidy(s.deviceType);
    this.#systemName = tidy(s.systemName);
    this.#faultType = tidy(s.faultType);
    this.#networkImpact = tidy(s.networkImpact);
    this.validateSpecialisedFields();
  }

  get deviceType() { return this.#deviceType; }
  get systemName() { return this.#systemName; }
  get faultType() { return this.#faultType; }
  get networkImpact() { return this.#networkImpact; }

  validateSpecialisedFields() { // override
    needText(this.#deviceType, "Device type");
    needText(this.#systemName, "System name");
    needText(this.#faultType, "Fault type");
    needOneOf(this.#networkImpact, NETWORK_IMPACTS, "Network impact");
    return true;
  }

  calculatePriorityScore() { // override
    const impactPoints = { "None": 0, "Local": 10, "Campus-Wide": 25 };
    return this.getPriorityValue() * 10 + impactPoints[this.#networkImpact];
  }

  getTargetResolutionHours() { // override
    const hours = { "None": 48, "Local": 24, "Campus-Wide": 4 };
    return hours[this.#networkImpact];
  }

  getRequestSummary() { // override
    return [
      ...this.getCommonSummary(),
      `Device     : ${this.#deviceType}`,
      `System     : ${this.#systemName}`,
      `Fault type : ${this.#faultType}`,
      `Network    : ${this.#networkImpact} impact`,
      `Score      : ${this.calculatePriorityScore()}   Target: ${this.getTargetResolutionHours()} hours`,
    ].join("\n");
  }

  toData() {
    return {
      ...super.toData(),
      deviceType: this.#deviceType,
      systemName: this.#systemName,
      faultType: this.#faultType,
      networkImpact: this.#networkImpact,
    };
  }
}

// ------------------------------------------------------------------
class MaintenanceRequest extends ServiceRequest {
  static SPECIALISED_FIELDS = ["building", "roomNumber", "hazardLevel", "equipmentAffected"];

  #building;
  #roomNumber;
  #hazardLevel;
  #equipmentAffected;

  constructor(commonRequestData, specialisedData) {
    super({ ...commonRequestData, category: "Facilities Maintenance" });
    const s = needSpecialisedData(specialisedData, "MaintenanceRequest");
    this.#building = tidy(s.building);
    this.#roomNumber = tidy(s.roomNumber);
    this.#hazardLevel = tidy(s.hazardLevel);
    this.#equipmentAffected = tidy(s.equipmentAffected);
    this.validateSpecialisedFields();
  }

  get building() { return this.#building; }
  get roomNumber() { return this.#roomNumber; }
  get hazardLevel() { return this.#hazardLevel; }
  get equipmentAffected() { return this.#equipmentAffected; }

  validateSpecialisedFields() {
    needText(this.#building, "Building");
    needText(this.#roomNumber, "Room number");
    needOneOf(this.#hazardLevel, RISK_LEVELS, "Hazard level");
    needText(this.#equipmentAffected, "Equipment affected");
    return true;
  }

  calculatePriorityScore() {
    const hazardPoints = { Low: 0, Medium: 10, High: 30 };
    return this.getPriorityValue() * 10 + hazardPoints[this.#hazardLevel];
  }

  getTargetResolutionHours() {
    const hours = { Low: 72, Medium: 24, High: 8 };
    return hours[this.#hazardLevel];
  }

  getRequestSummary() {
    return [
      ...this.getCommonSummary(),
      `Building   : ${this.#building}, Room ${this.#roomNumber}`,
      `Hazard     : ${this.#hazardLevel}`,
      `Equipment  : ${this.#equipmentAffected}`,
      `Score      : ${this.calculatePriorityScore()}   Target: ${this.getTargetResolutionHours()} hours`,
    ].join("\n");
  }

  toData() {
    return {
      ...super.toData(),
      building: this.#building,
      roomNumber: this.#roomNumber,
      hazardLevel: this.#hazardLevel,
      equipmentAffected: this.#equipmentAffected,
    };
  }
}

// ------------------------------------------------------------------
class CleaningRequest extends ServiceRequest {
  static SPECIALISED_FIELDS = ["cleaningArea", "hygieneRisk", "serviceType", "preferredServiceTime"];

  #cleaningArea;
  #hygieneRisk;
  #serviceType;
  #preferredServiceTime;

  constructor(commonRequestData, specialisedData) {
    super({ ...commonRequestData, category: "Cleaning and Sanitation" });
    const s = needSpecialisedData(specialisedData, "CleaningRequest");
    this.#cleaningArea = tidy(s.cleaningArea);
    this.#hygieneRisk = tidy(s.hygieneRisk);
    this.#serviceType = tidy(s.serviceType);
    this.#preferredServiceTime = tidy(s.preferredServiceTime);
    this.validateSpecialisedFields();
  }

  get cleaningArea() { return this.#cleaningArea; }
  get hygieneRisk() { return this.#hygieneRisk; }
  get serviceType() { return this.#serviceType; }
  get preferredServiceTime() { return this.#preferredServiceTime; }

  validateSpecialisedFields() {
    needText(this.#cleaningArea, "Cleaning area");
    needOneOf(this.#hygieneRisk, RISK_LEVELS, "Hygiene risk");
    needText(this.#serviceType, "Service type");
    needOneOf(this.#preferredServiceTime, SERVICE_TIMES, "Preferred service time");
    return true;
  }

  calculatePriorityScore() {
    const riskPoints = { Low: 0, Medium: 8, High: 20 };
    return this.getPriorityValue() * 10 + riskPoints[this.#hygieneRisk];
  }

  getTargetResolutionHours() {
    const hours = { Low: 48, Medium: 24, High: 6 };
    return hours[this.#hygieneRisk];
  }

  getRequestSummary() {
    return [
      ...this.getCommonSummary(),
      `Area       : ${this.#cleaningArea}`,
      `Service    : ${this.#serviceType} (preferred time: ${this.#preferredServiceTime})`,
      `Hygiene    : ${this.#hygieneRisk} risk`,
      `Score      : ${this.calculatePriorityScore()}   Target: ${this.getTargetResolutionHours()} hours`,
    ].join("\n");
  }

  toData() {
    return {
      ...super.toData(),
      cleaningArea: this.#cleaningArea,
      hygieneRisk: this.#hygieneRisk,
      serviceType: this.#serviceType,
      preferredServiceTime: this.#preferredServiceTime,
    };
  }
}

// ------------------------------------------------------------------
// The fourth category ("General Campus Service") also needs a class,
// otherwise requests in that category could not be stored or processed.
class GeneralServiceRequest extends ServiceRequest {
  static SPECIALISED_FIELDS = ["serviceType"];

  #serviceType;

  constructor(commonRequestData, specialisedData) {
    super({ ...commonRequestData, category: "General Campus Service" });
    const s = needSpecialisedData(specialisedData, "GeneralServiceRequest");
    this.#serviceType = tidy(s.serviceType);
    this.validateSpecialisedFields();
  }

  get serviceType() { return this.#serviceType; }

  validateSpecialisedFields() {
    needText(this.#serviceType, "Service type");
    return true;
  }

  calculatePriorityScore() {
    return this.getPriorityValue() * 10;
  }

  getTargetResolutionHours() {
    return 72;
  }

  getRequestSummary() {
    return [
      ...this.getCommonSummary(),
      `Service    : ${this.#serviceType}`,
      `Score      : ${this.calculatePriorityScore()}   Target: ${this.getTargetResolutionHours()} hours`,
    ].join("\n");
  }

  toData() {
    return { ...super.toData(), serviceType: this.#serviceType };
  }
}

module.exports = {
  ICTSupportRequest,
  MaintenanceRequest,
  CleaningRequest,
  GeneralServiceRequest,
  NETWORK_IMPACTS,
  RISK_LEVELS,
  SERVICE_TIMES,
};
