"use strict";

const {resolveApiAssociation} = require("../api-external/common/apiHelpers");

/**
 * Sanitise the model before sending it trhough the wire
 * @param {object} _model The model instance
 * @returns {object} the sanitized object
 */
function sanitiseJsonModel(_model) {
    const obj = _model.toObject();

    Object.keys(obj)
        .filter((_key) => obj[_key] === null)
        .forEach((_key) => {
            delete obj[_key];
        });

    resolveApiAssociation(obj);

    return obj;
}


module.exports = {sanitiseJsonModel};
