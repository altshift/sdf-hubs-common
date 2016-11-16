"use strict";
/* eslint-disable no-magic-numbers */

// local dependencies
const errorDefinitions = require("./errorDefinitions");

/* ************************************* Const definitions ***************************************/

const POSTGRES_ERROR_CODE = { // eslint-disable object-curly-newline
    "23503": "FOREIGN_KEY_VIOLATION"
};
const sailsToAsMessage = { // eslint-disable object-curly-newline
    "in": "Value not among allowed candidates, look in the api docs for valid candidates."
};
const sailsToAsCode = {
    "in": "validation",
    integer: "validation",
    required: "required"
};

/* ************************************* Logic ***************************************/

/**
 * Return true if the given error is a waterline postgres error we know how to handle
 * @param {object} _error the error to check
 * @return {boolean} True if given error is a waterline postgres error
 */
function isHandledPostgresError(_error) {
    const code = _error.originalError && POSTGRES_ERROR_CODE[_error.originalError.code];

    return code !== undefined;
}

/**
 * Transform the given postgres error into clientError
 * @param {object} _postgresError the waterline postgres error
 * @return {object} A valid clientError
 */
function postgresToClientError(_postgresError) {
    const isForeignKeyError = _postgresError.originalError.code === "23503";
    let clientError;

    if (isForeignKeyError) {
        const field = {
            key: _postgresError.originalError.constraint,
            message: "Foreign key constraint violation, are you sure the foreign row exists?",
            type: "validation"
        };

        clientError = errorDefinitions.validationError(_postgresError.message, [field], 400);
    } else {
        clientError = errorDefinitions.error500(_postgresError);
    }

    return clientError;
}

/**
 * Return true if given error is a waterline validation error
 * @param {object} _error the error to test
 * @returns {boolean} true if _error is a waterline validation error
 */
function isWaterlineValidationError(_error) {
    return _error.invalidAttributes !== undefined;
}

/**
 * Create a field validation error from a waterline javascript error
 * @param {object} _sailsError Waterline javascript error
 * @returns {object} clientError with fields
*/
function waterlineToValidationError(_sailsError) {
    const fieldError = [];

    Object.keys(_sailsError.invalidAttributes)
        .forEach((_key) => {
            const sailsDescriptions = _sailsError.invalidAttributes[_key];

            sailsDescriptions.forEach(({rule}) => {
                fieldError.push({
                    key: _key,
                    message: `${sailsToAsMessage[rule]} - with type error ${rule}`,
                    type: sailsToAsCode[rule] || "validation"
                });
            });
        });

    return errorDefinitions.validationError(_sailsError.message, fieldError, 400);
}

/**
 * Convert the error to a readable clientError if the error is a sails error
 *
 * @param {object} _error an error to test and convert
 * @returns {object} clientError or null if error is not a recognized sails error
 *
 */
function toClientError(_error) {
    let clientError = null;

    if (isHandledPostgresError(_error)) {
        clientError = postgresToClientError(_error);
    } else if (isWaterlineValidationError(_error)) {
        clientError = waterlineToValidationError(_error);
    }

    return clientError;
}

module.exports = {toClientError};
