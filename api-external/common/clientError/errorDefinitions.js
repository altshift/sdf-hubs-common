"use strict";
/* eslint-disable no-magic-numbers */

/* ****************************************** Const definitions ****************************************** */
const httpCodeToMessage = {
    "400": "Bad Request",
    "401": "Unauthorized (please authenticate)",
    "403": "Forbidden",
    "404": "Not Found",
    "429": "Too many requests",
    "500": "Internal server error"
};

const validationErrorType = {
    REQUIRED: "required",
    UNRECOGNIZED: "unrecognized-field",
    VALIDATION: "validation"
};

const swaggerCodeToAsType = { // eslint-disable object-curly-newline
    OBJECT_MISSING_REQUIRED_PROPERTY: "required"
};

const defaultTooManyArgumentsMessage = "Too many arguments, field may be unwanted";

/* ****************************************** Logic ****************************************** */
/**
 * Build an error object to be sent to the client
 *
 * @param {number} _httpCode http error code
 * @param {string} _apiMessage info message from api
 *
 * @returns {object} the error object
 *
 */
function error(_httpCode, _apiMessage = null) {
    const clientError = {
        httpCode: _httpCode,
        httpMessage: httpCodeToMessage[`${_httpCode}`]
    };

    if (_apiMessage) {
        clientError.apiMessage = _apiMessage;
    }

    return clientError;
}

/**
 * Build a code validation error object to be sent to the client
 *
 * @param {string} _apiMessage info message from api
 * @param {object[]} _fields array of validation errors
 * @param {Error} _httpCode http code of the error
 *
 * @returns {object} the error object
 *
 */
function validationError(_apiMessage, _fields, _httpCode) {
    const clientError = error(_httpCode, _apiMessage);

    clientError.fields = _fields || [];

    return clientError;
}

/**
 * Build a code 404 error object to be sent to the client
 *
 * @param {string} _apiMessage info message from api
 *
 * @returns {object} the error object
 *
 */
function error404(_apiMessage) {
    const clientError = error(404, _apiMessage); // eslint-disable-line no-magic-numbers

    return clientError;
}

/**
 * Build a 400 clientError from a javascript error from a swagger validation
 *
 * @param {Error} _jsError swagger validation javascript error object
 * @param {Error} _httpCode http code of the error
 * @returns {object} the error object
 */
function validationErrorFromJsError(_jsError, _httpCode) {
    const isFieldError = _jsError.results !== undefined && Array.isArray(_jsError.results.errors);
    let fieldError = null;

    if (isFieldError) {
        fieldError = _jsError.results.errors.map(({description, message, path, code}) => {
            const validationMessage = description ? `${message} => ${description}` : message;

            return {
                key: path.join("."),
                message: validationMessage,
                type: swaggerCodeToAsType[code] || "validation"
            };
        });
    }

    return validationError(_jsError.message, fieldError, _httpCode);
}

/**
 * Build a code 500 error object to be sent to the client
 *
 * @param {object|string} _errorOrMessage Javascript error that occured or message
 *
 * @returns {object} the error object
 *
 */
function error500(_errorOrMessage) {
    const isJsError = typeof _errorOrMessage === "object";
    const javascriptError = isJsError ? _errorOrMessage : new Error(_errorOrMessage);
    const clientError = error(500, javascriptError.message); // eslint-disable-line no-magic-numbers

    clientError.stackTrace = javascriptError.stack;

    return clientError;
}

/**
 * Return true if given object is a valid client error
 *
 * @param {any} _error The error to test
 *
 * @returns {boolean} true if error is a client Error
 *
 */
function isClientError(_error) {
    const isObject = typeof _error === "object";
    const hasHttpCode = isObject && typeof _error.httpCode === "number";
    const hasHttpMessage = isObject && typeof _error.httpMessage === "string";

    const isError500 = isObject && _error.httpCode !== 500; // eslint-disable-line no-magic-numbers
    const hasStackIf500 = isObject && (isError500 || typeof _error.stackTrace === "string");

    return hasHttpCode && hasHttpMessage && hasStackIf500;
}

/**
 * @param {object} _params Object olding swagger parameters
 * @param {string} _apiMessage api message for error
 * @param {string} _fieldMessage Message for every field error
 *
 * @returns {object} the error object
 */
function tooManyArgumentsError(_params, _apiMessage, _fieldMessage = defaultTooManyArgumentsMessage) {
    const fields = Object.keys(_params)
        .map(_key => {
            return {
                code: "AS_TOO_MANY_ARGUMENTS",
                key: _key,
                message: _fieldMessage
            };
        });

    return validationError(_apiMessage, fields, 400);// eslint-disable-line no-magic-numbers
}

/**
 * @param {function} _next connect next middleware cb
 * @param {string} _error the error to deal with
 * @returns {void}
 */
function send(_next, _error) {
    _next(_error);
}

/**
 * @param {function} _next connect next middleware cb
 * @param {string} _message (optional) message of the error
 * @returns {void}
 */
function send404(_next, _message = null) {
    send(_next, error404(_message));
}

/**
 * @param {function} _next connect next middleware cb
 * @param {string} _message message of the error
 * @param {string} _fields list of field errors
 * @returns {void}
 */
function send400(_next, _message, _fields) {
    send(_next, validationError(_message, _fields, 400));
}

/**
 * Send a 403 error (Forbidden)
 * @param {function} _next connect next middleware cb
 * @param {string} _message (optional) message of the error
 * @returns {void}
 */
function send403(_next, _message = null) {
    send(_next, error(403, _message));
}

/**
 * Generate a function that know how to deal with errors,
 * can be used directly in error callbacks
 *
 * @param {function} _next connect next middleware cb
 * @param {function} _callbackIfOk connect response
 * @returns {function} a callback that wan deal with errors
 */
function handleErrorAsync(_next, _callbackIfOk = null) {
    return (...args) => {
        const argError = args[0];

        if (argError) {
            send(_next, argError);
        } else if (_callbackIfOk) {
            const otherArgs = args.splice(1);

            _callbackIfOk(otherArgs);
        }
    };
}

module.exports = {
    error,
    error404,
    error500,
    handleErrorAsync,
    isClientError,
    send,
    send400,
    send403,
    send404,
    tooManyArgumentsError,
    validationError,
    validationErrorFromJsError,
    validationErrorType
};
