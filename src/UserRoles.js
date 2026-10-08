// UserRoles.js
// CREDIT: the four specialised users. Each one INHERITS from User
// and calls the User constructor with super() (constructor chaining).

const { User } = require("./User");

class StudentRequester extends User {
  #programme;
  #yearLevel;

  constructor(userId, firstName, lastName, email, programme, yearLevel) {
    super(userId, firstName, lastName, email, "Student"); // constructor chaining
    this.#programme = User.checkText(programme, "Programme");
    this.#yearLevel = StudentRequester.checkYear(yearLevel);
  }

  static checkYear(value) {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1 || year > 6) {
      throw new Error("Year level must be a whole number from 1 to 6.");
    }
    return year;
  }

  get programme() { return this.#programme; }
  get yearLevel() { return this.#yearLevel; }

  displayInfo() { // method overriding
    return `${super.displayInfo()} | ${this.#programme}, Year ${this.#yearLevel}`;
  }

  toData() {
    return { ...super.toData(), programme: this.#programme, yearLevel: this.#yearLevel };
  }
}

class StaffRequester extends User {
  #department;

  constructor(userId, firstName, lastName, email, department) {
    super(userId, firstName, lastName, email, "Staff");
    this.#department = User.checkText(department, "Department");
  }

  get department() { return this.#department; }

  displayInfo() {
    return `${super.displayInfo()} | ${this.#department}`;
  }

  toData() {
    return { ...super.toData(), department: this.#department };
  }
}

class ServiceOfficer extends User {
  #serviceSection;

  constructor(userId, firstName, lastName, email, serviceSection) {
    super(userId, firstName, lastName, email, "Service Officer");
    this.#serviceSection = User.checkText(serviceSection, "Service section");
  }

  get serviceSection() { return this.#serviceSection; }

  displayInfo() {
    return `${super.displayInfo()} | Section: ${this.#serviceSection}`;
  }

  toData() {
    return { ...super.toData(), serviceSection: this.#serviceSection };
  }
}

class Technician extends User {
  #speciality;

  constructor(userId, firstName, lastName, email, speciality) {
    super(userId, firstName, lastName, email, "Technician");
    this.#speciality = User.checkText(speciality, "Technical speciality");
  }

  get speciality() { return this.#speciality; }

  displayInfo() {
    return `${super.displayInfo()} | Speciality: ${this.#speciality}`;
  }

  toData() {
    return { ...super.toData(), speciality: this.#speciality };
  }
}

// Rebuilds the correct class from plain saved data (used when loading JSON).
function createUserFromData(data) {
  switch (data.userType) {
    case "Student":
      return new StudentRequester(data.userId, data.firstName, data.lastName, data.email, data.programme, data.yearLevel);
    case "Staff":
      return new StaffRequester(data.userId, data.firstName, data.lastName, data.email, data.department);
    case "Service Officer":
      return new ServiceOfficer(data.userId, data.firstName, data.lastName, data.email, data.serviceSection);
    case "Technician":
      return new Technician(data.userId, data.firstName, data.lastName, data.email, data.speciality);
    default:
      // A plain User (Pass level) is still allowed.
      return new User(data.userId, data.firstName, data.lastName, data.email, data.userType);
  }
}

module.exports = { StudentRequester, StaffRequester, ServiceOfficer, Technician, createUserFromData };
