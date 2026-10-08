// Repositories.js
// DISTINCTION: these classes are the ONLY place that reads and writes JSON files.
// The menu (CampusServiceApp) and the domain classes never touch the files.
// Uses the built-in Node.js fs/promises module. No database.

const fs = require("fs/promises");
const path = require("path");

class JsonFileRepository {
  #filePath;
  #idField;

  constructor(filePath, idField) {
    this.#filePath = filePath;
    this.#idField = idField;
  }

  get filePath() { return this.#filePath; }

  // Read every record. A missing or empty file gives an empty array.
  async loadAll() {
    let text;
    try {
      text = await fs.readFile(this.#filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.saveAll([]); // create the file with an empty array
        return [];
      }
      throw new Error(`File read error (${this.#filePath}): ${error.message}`);
    }
    if (text.trim() === "") {
      return [];
    }
    let records;
    try {
      records = JSON.parse(text);
    } catch (error) {
      throw new Error(`File read error (${this.#filePath}): the file is not valid JSON.`);
    }
    if (!Array.isArray(records)) {
      throw new Error(`File read error (${this.#filePath}): the file must contain a JSON array.`);
    }
    return records;
  }

  // Replace the whole file with the given array of plain records.
  async saveAll(records) {
    if (!Array.isArray(records)) {
      throw new Error("saveAll() needs an array of records.");
    }
    try {
      await fs.mkdir(path.dirname(this.#filePath), { recursive: true });
      await fs.writeFile(this.#filePath, JSON.stringify(records, null, 2), "utf8");
    } catch (error) {
      throw new Error(`File write error (${this.#filePath}): ${error.message}`);
    }
  }

  async create(record) {
    const records = await this.loadAll();
    if (records.some((r) => r[this.#idField] === record[this.#idField])) {
      throw new Error(`A record with ${this.#idField} "${record[this.#idField]}" already exists.`);
    }
    records.push(record);
    await this.saveAll(records);
    return record;
  }

  async findById(id) {
    const records = await this.loadAll();
    return records.find((r) => r[this.#idField] === id) ?? null;
  }

  async update(id, changes) {
    const records = await this.loadAll();
    const index = records.findIndex((r) => r[this.#idField] === id);
    if (index === -1) {
      throw new Error(`No record with ${this.#idField} "${id}" was found.`);
    }
    records[index] = { ...records[index], ...changes };
    await this.saveAll(records);
    return records[index];
  }
}

class UserFileRepository extends JsonFileRepository {
  constructor(filePath) {
    super(filePath, "userId");
  }
}

class ServiceRequestFileRepository extends JsonFileRepository {
  constructor(filePath) {
    super(filePath, "requestId");
  }

  async findByRequester(userId) {
    const records = await this.loadAll();
    return records.filter((r) => r.requesterId === userId);
  }

  async findByTechnician(technicianId) {
    const records = await this.loadAll();
    return records.filter((r) => r.assignedTechnicianId === technicianId);
  }
}

class RequestHistoryFileRepository extends JsonFileRepository {
  constructor(filePath) {
    super(filePath, "historyId");
  }

  async findByRequest(requestId) {
    const records = await this.loadAll();
    return records.filter((r) => r.requestId === requestId);
  }
}

class AuditFileRepository extends JsonFileRepository {
  constructor(filePath) {
    super(filePath, "auditId");
  }

  async findByRequest(requestId) {
    const records = await this.loadAll();
    return records.filter((r) => r.requestId === requestId);
  }
}

// Convenience: build all four repositories for one data folder.
function createRepositories(dataFolder) {
  return {
    userRepo: new UserFileRepository(path.join(dataFolder, "users.json")),
    requestRepo: new ServiceRequestFileRepository(path.join(dataFolder, "serviceRequests.json")),
    historyRepo: new RequestHistoryFileRepository(path.join(dataFolder, "requestHistory.json")),
    auditRepo: new AuditFileRepository(path.join(dataFolder, "auditLog.json")),
  };
}

module.exports = {
  JsonFileRepository,
  UserFileRepository,
  ServiceRequestFileRepository,
  RequestHistoryFileRepository,
  AuditFileRepository,
  createRepositories,
};
