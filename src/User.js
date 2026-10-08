// User.js
// Base class for everybody who uses the system.
// PASS: private fields, constructor, getters, controlled setters,
//       getFullName(), validate(), displayInfo().

const USER_TYPES = ["Student", "Staff", "Service Officer", "Technician"];

class User {
  // Private fields (encapsulation): only code inside this class can touch them.
  #userId;
  #firstName;
  #lastName;
  #email;
  #userType;

  constructor(userId, firstName, lastName, email, userType) {
    // Every value is checked, so a bad value is rejected immediately.
    this.#userId = User.checkText(userId, "User ID");
    this.#firstName = User.checkText(firstName, "First name");
    this.#lastName = User.checkText(lastName, "Last name");
    this.#email = User.checkEmail(email);
    this.#userType = User.checkUserType(userType);
  }

  // ---------- small checking helpers (static = belong to the class) ----------
  static checkText(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label} is required.`);
    }
    return value.trim();
  }

  static checkEmail(value) {
    const email = User.checkText(value, "Email address");
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!looksLikeEmail.test(email)) {
      throw new Error(`Email address "${email}" is not valid.`);
    }
    return email;
  }

  static checkUserType(value) {
    if (!USER_TYPES.includes(value)) {
      throw new Error(`User type must be one of: ${USER_TYPES.join(", ")}.`);
    }
    return value;
  }

  // ---------- getters ----------
  get userId() { return this.#userId; }
  get firstName() { return this.#firstName; }
  get lastName() { return this.#lastName; }
  get email() { return this.#email; }
  get userType() { return this.#userType; }

  // ---------- controlled setters (the user ID and type never change) ----------
  set firstName(value) { this.#firstName = User.checkText(value, "First name"); }
  set lastName(value) { this.#lastName = User.checkText(value, "Last name"); }
  set email(value) { this.#email = User.checkEmail(value); }

  // ---------- methods ----------
  getFullName() {
    return `${this.#firstName} ${this.#lastName}`;
  }

  // Throws an error if any value is invalid. Returns true when everything is fine.
  validate() {
    User.checkText(this.#userId, "User ID");
    User.checkText(this.#firstName, "First name");
    User.checkText(this.#lastName, "Last name");
    User.checkEmail(this.#email);
    User.checkUserType(this.#userType);
    return true;
  }

  displayInfo() {
    return `${this.#userId} | ${this.getFullName()} | ${this.#userType} | ${this.#email}`;
  }

  // Plain data that can be saved to a JSON file.
  toData() {
    return {
      userId: this.#userId,
      firstName: this.#firstName,
      lastName: this.#lastName,
      email: this.#email,
      userType: this.#userType,
    };
  }
}

module.exports = { User, USER_TYPES };
