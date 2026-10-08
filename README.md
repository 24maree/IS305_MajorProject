# Campus Service Request Management System

**IS305 Object-Oriented Programming - AT3 Major Project**
Divine Word University | Student: Mareerose Possi (240456)

A Node.js console application that records, assigns, processes and monitors campus service
requests (ICT, maintenance, cleaning and general services). It uses **JavaScript classes only,
no database**. Data is saved in JSON files with the built-in `fs/promises` module.

## 1. What you need

- Node.js 20 or newer (tested on Node 22). Check with `node --version`.
- No `npm install` is needed: the project uses only built-in Node.js modules.

## 2. How to run

```bash
cd campus-service-system
npm run seed     # optional: fills data/ with SIMULATED demo users and requests
npm start        # starts the console menu
npm test         # runs the 40 automated tests
```

Demo IDs after `npm run seed`: students `DWU2026001`, `DWU2026002`; staff `STF001`;
Service Officer `OFF001`; Technicians `TECH001`, `TECH002`.
To start from empty data, delete the four files in `data/` (they are re-created on start).

## 3. Project structure

```
campus-service-system/
  src/
    User.js                    PASS  User base class
    ServiceRequest.js          PASS  ServiceRequest base class (abstract-style, workflow, history)
    ServiceRequestManager.js   PASS  arrays, rules, role permissions, audit log, save/load
    CampusServiceApp.js        PASS  console menu (no file code inside)
    UserRoles.js               CREDIT  StudentRequester, StaffRequester, ServiceOfficer, Technician
    RequestTypes.js            CREDIT  ICTSupportRequest, MaintenanceRequest, CleaningRequest, GeneralServiceRequest
    ServiceRequestFactory.js   DISTINCTION  rebuilds the right class from saved JSON
    Repositories.js            DISTINCTION  JSON file repositories (fs/promises)
    ReportService.js           DISTINCTION  9 management reports
    Prompter.js                helper that reads typed lines
  data/                        users.json, serviceRequests.json, requestHistory.json, auditLog.json
  tests/campus.test.js         40 automated tests (node:test), temporary files only
  scripts/seedData.js          creates simulated demo data
  docs/images/                 UML diagrams and console screenshots
```

## 4. How the levels fit together

| Level | What was added |
|-------|----------------|
| Pass | User, ServiceRequest, ServiceRequestManager, menu items 1-10, validation |
| Credit | Subclasses with `super()`, controlled status workflow, role permissions, request history, filter and sort (menu 11-13, 15) |
| Distinction | Abstract-style methods, polymorphism, JSON persistence with repositories and a factory, audit trail, reports (menu 14), automated tests |

Each level **extends** the same application. Nothing was replaced.

## 5. Workflow rules

```
Submitted -> Reviewed -> Assigned -> In Progress -> Resolved -> Closed
Submitted -> Cancelled      (Cancelled and Closed are final)
```

- Requester: update or cancel **only their own Submitted** request.
- Service Officer: review, set priority, assign Technician, verify and close.
- Technician: only the **assigned** Technician starts, adds progress notes and resolves.

## 6. GitHub (version control)

```bash
git init
git add .
git commit -m "Pass: User, ServiceRequest, Manager and console menu"
# ...commit again after the Credit and Distinction work, then:
git branch -M main
git remote add origin https://github.com/<your-username>/campus-service-system.git
git push -u origin main
```

Suggested commit messages: `Pass: core classes`, `Credit: inheritance and workflow`,
`Distinction: JSON repositories and factory`, `Add automated tests`, `Add documentation`.

## 7. Known limitations

- No login or passwords (the brief forbids storing passwords). Users type their own ID.
- Reports and audit log are open from the menu; there is no separate administrator account.
- One user at a time; the JSON files are not meant for several programs writing at once.
