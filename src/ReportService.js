// ReportService.js
// DISTINCTION: management reports. Every report uses array methods
// (filter, map, reduce, sort). A report never changes any request.

const { STATUSES, PRIORITIES, CATEGORIES } = require("./ServiceRequest");

const HOUR = 60 * 60 * 1000;

class ReportService {
  #requests;
  #clock;

  // requests = array of ServiceRequest objects, clock = function that returns "now"
  constructor(requests, clock = () => new Date()) {
    this.#requests = requests;
    this.#clock = clock;
  }

  // Helper: count how many requests have each value, e.g. { Submitted: 2, Closed: 1 }
  #countBy(getValue, allValues = []) {
    const start = Object.fromEntries(allValues.map((v) => [v, 0]));
    return this.#requests.reduce((counts, request) => {
      const key = getValue(request);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, start);
  }

  // 1. Requests grouped by status
  byStatus() {
    return this.#countBy((r) => r.status, STATUSES);
  }

  // 2. Requests grouped by category
  byCategory() {
    return this.#countBy((r) => r.category, CATEGORIES);
  }

  // 3. Requests grouped by priority
  byPriority() {
    return this.#countBy((r) => r.priority, PRIORITIES);
  }

  // 4. Urgent requests that are not finished yet
  urgentRequests() {
    return this.#requests.filter(
      (r) => r.priority === "Urgent" && r.status !== "Closed" && r.status !== "Cancelled"
    );
  }

  // 5. Overdue = still waiting for a fix and older than its target resolution time
  overdueRequests() {
    const now = this.#clock();
    const stillOpen = ["Submitted", "Reviewed", "Assigned", "In Progress"];
    return this.#requests.filter((r) => {
      const hoursOpen = (now - r.dateSubmitted) / HOUR;
      return stillOpen.includes(r.status) && hoursOpen > r.getTargetResolutionHours();
    });
  }

  // 6. How many requests each Technician has been given
  assignedByTechnician() {
    return this.#requests
      .filter((r) => r.assignedTechnicianId !== null)
      .reduce((counts, r) => {
        counts[r.assignedTechnicianId] = (counts[r.assignedTechnicianId] ?? 0) + 1;
        return counts;
      }, {});
  }

  // 7. How many requests each Technician has finished (Resolved or Closed)
  completedByTechnician() {
    return this.#requests
      .filter((r) => r.assignedTechnicianId !== null && (r.status === "Resolved" || r.status === "Closed"))
      .reduce((counts, r) => {
        counts[r.assignedTechnicianId] = (counts[r.assignedTechnicianId] ?? 0) + 1;
        return counts;
      }, {});
  }

  // 8. Average hours from "submitted" to "resolved" (0 when nothing is resolved yet)
  averageResolutionHours() {
    const hours = this.#requests
      .filter((r) => r.dateResolved !== null)
      .map((r) => (r.dateResolved - r.dateSubmitted) / HOUR);
    if (hours.length === 0) {
      return 0;
    }
    const average = hours.reduce((sum, h) => sum + h, 0) / hours.length;
    return Math.round(average * 100) / 100;
  }

  // 9. Request volume by campus location (busiest first)
  volumeByLocation() {
    const counts = this.#countBy((r) => r.location);
    return Object.entries(counts)
      .map(([location, total]) => ({ location, total }))
      .sort((a, b) => b.total - a.total || a.location.localeCompare(b.location));
  }
}

module.exports = { ReportService };
