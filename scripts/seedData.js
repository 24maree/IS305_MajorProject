// scripts/seedData.js
// Creates SIMULATED demo data in the data/ folder by running the real workflow.
// Run with:  npm run seed      (this replaces the current JSON files)

const path = require("path");
const { ServiceRequestManager } = require("../src/ServiceRequestManager");
const { createRepositories } = require("../src/Repositories");
const { StudentRequester, StaffRequester, ServiceOfficer, Technician } = require("../src/UserRoles");
const { ServiceRequestFactory } = require("../src/ServiceRequestFactory");

async function seed() {
  const dataFolder = process.env.CAMPUS_DATA_DIR || path.join(__dirname, "..", "data");

  // A fake clock so the demo data has believable dates.
  let current = new Date("2026-09-01T08:00:00.000Z");
  const clock = () => new Date(current);
  const hoursLater = (h) => { current = new Date(current.getTime() + h * 3600 * 1000); };

  const manager = new ServiceRequestManager({ repos: createRepositories(dataFolder), clock });

  // ---- users (all simulated) ----
  manager.registerUser(new StudentRequester("DWU2026001", "Mareerose", "Possi", "mareerose.possi@example.com", "Bachelor of Information Systems", 3));
  manager.registerUser(new StudentRequester("DWU2026002", "John", "Kila", "john.kila@example.com", "Bachelor of Accounting", 2));
  manager.registerUser(new StaffRequester("STF001", "Grace", "Tau", "grace.tau@example.com", "Library"));
  manager.registerUser(new ServiceOfficer("OFF001", "Peter", "Wari", "peter.wari@example.com", "Campus Services"));
  manager.registerUser(new Technician("TECH001", "Samuel", "Dagi", "samuel.dagi@example.com", "Networks"));
  manager.registerUser(new Technician("TECH002", "Anna", "Mou", "anna.mou@example.com", "Electrical"));

  const makeRequest = (category, who, title, description, location, priority, extra) =>
    ServiceRequestFactory.createForCategory(
      category,
      { requestId: manager.generateRequestId(), requester: manager.findUserById(who), title, description, location, priority, dateSubmitted: clock() },
      extra
    );

  // REQ001 - ICT, goes all the way to Closed
  manager.submitRequest(makeRequest("ICT Support", "DWU2026001", "Unable to access campus Wi-Fi",
    "Laptop cannot connect to the student Wi-Fi.", "Library Level 2", "High",
    { deviceType: "Laptop", systemName: "Campus Wi-Fi", faultType: "Cannot connect", networkImpact: "Local" }));
  hoursLater(1);
  manager.reviewRequest("REQ001", "OFF001", "High");
  hoursLater(1);
  manager.assignTechnician("REQ001", "OFF001", "TECH001");
  hoursLater(1);
  manager.startWork("REQ001", "TECH001");
  hoursLater(2);
  manager.addProgressNote("REQ001", "TECH001", "Access point rebooted, testing the connection.");
  hoursLater(2);
  manager.resolveRequest("REQ001", "TECH001", "Access point replaced and tested.");
  hoursLater(1);
  manager.closeRequest("REQ001", "OFF001", "Student confirmed Wi-Fi works.");

  // REQ002 - Maintenance, In Progress
  hoursLater(2);
  manager.submitRequest(makeRequest("Facilities Maintenance", "STF001", "Broken ceiling light",
    "Ceiling light flickers and makes a buzzing noise.", "Admin Block", "Urgent",
    { building: "Admin Block", roomNumber: "A12", hazardLevel: "High", equipmentAffected: "Ceiling light" }));
  hoursLater(1);
  manager.reviewRequest("REQ002", "OFF001", "Urgent");
  manager.assignTechnician("REQ002", "OFF001", "TECH002");
  hoursLater(1);
  manager.startWork("REQ002", "TECH002");

  // REQ003 - Cleaning, only Submitted (and old, so it shows as overdue)
  manager.submitRequest(makeRequest("Cleaning and Sanitation", "DWU2026002", "Spill in the cafeteria",
    "Drink spilled near the main entrance.", "Cafeteria", "Normal",
    { cleaningArea: "Cafeteria entrance", hygieneRisk: "Medium", serviceType: "Spill clean-up", preferredServiceTime: "Morning" }));

  // REQ004 - General, Reviewed
  hoursLater(1);
  manager.submitRequest(makeRequest("General Campus Service", "DWU2026001", "Request for extra chairs",
    "Need ten extra chairs for a student event.", "Student Centre", "Low",
    { serviceType: "Furniture move" }));
  manager.reviewRequest("REQ004", "OFF001", "Low");

  // REQ005 - ICT, cancelled by the requester
  hoursLater(1);
  manager.submitRequest(makeRequest("ICT Support", "DWU2026002", "Projector not working",
    "Projector shows no picture.", "Lecture Room 3", "Normal",
    { deviceType: "Projector", systemName: "Room 3 AV system", faultType: "No display", networkImpact: "None" }));
  manager.cancelRequest("REQ005", "DWU2026002");

  await manager.save();
  console.log(`Demo data saved in ${dataFolder}`);
}

seed().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exit(1);
});
