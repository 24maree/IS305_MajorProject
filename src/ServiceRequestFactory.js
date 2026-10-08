// ServiceRequestFactory.js
// DISTINCTION: JSON files only store plain data, not real class objects.
// The factory turns saved data back into the correct specialised object,
// so restored requests still have their own validation and overridden methods.

const {
  ICTSupportRequest,
  MaintenanceRequest,
  CleaningRequest,
  GeneralServiceRequest,
} = require("./RequestTypes");

// requestType name -> class
const CLASS_BY_TYPE = {
  ICTSupportRequest,
  MaintenanceRequest,
  CleaningRequest,
  GeneralServiceRequest,
};

// category -> class (used when a user submits a new request)
const CLASS_BY_CATEGORY = {
  "ICT Support": ICTSupportRequest,
  "Facilities Maintenance": MaintenanceRequest,
  "Cleaning and Sanitation": CleaningRequest,
  "General Campus Service": GeneralServiceRequest,
};

class ServiceRequestFactory {
  // savedData  = one record from serviceRequests.json (plain object)
  // requester  = the User object that matches savedData.requesterId
  // savedData.history (optional) = the history entries for this request
  static createFromData(savedData, requester) {
    if (!savedData || typeof savedData !== "object") {
      throw new Error("Saved request data is missing.");
    }
    const RequestClass = CLASS_BY_TYPE[savedData.requestType];
    if (!RequestClass) {
      throw new Error(`Unknown request type "${savedData.requestType}" in saved data.`);
    }
    const commonData = {
      requestId: savedData.requestId,
      requester,
      title: savedData.title,
      description: savedData.description,
      location: savedData.location,
      category: savedData.category,
      priority: savedData.priority,
      status: savedData.status,
      dateSubmitted: savedData.dateSubmitted,
      dateUpdated: savedData.dateUpdated,
      dateResolved: savedData.dateResolved,
      assignedTechnicianId: savedData.assignedTechnicianId,
      history: savedData.history || [],
    };
    const specialisedData = {};
    for (const field of RequestClass.SPECIALISED_FIELDS) {
      specialisedData[field] = savedData[field];
    }
    return new RequestClass(commonData, specialisedData);
  }

  // Create a brand new request for a category.
  static createForCategory(category, commonData, specialisedData) {
    const RequestClass = CLASS_BY_CATEGORY[category];
    if (!RequestClass) {
      throw new Error(`Unsupported category "${category}".`);
    }
    return new RequestClass(commonData, specialisedData);
  }

  // Which specialised fields does this category need? (the menu uses this)
  static getSpecialisedFields(category) {
    const RequestClass = CLASS_BY_CATEGORY[category];
    return RequestClass ? [...RequestClass.SPECIALISED_FIELDS] : [];
  }
}

module.exports = { ServiceRequestFactory };
