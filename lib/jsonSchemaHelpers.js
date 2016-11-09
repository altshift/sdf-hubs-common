"use strict";

const {resolveRefsAt} = require("json-refs");
const deepMerge = require("./deepMerge");

/**
 * @param {object} _objectDst Object where to merge all object in arrays
 * @param {object[]} _arraySrc List of object to be merged inside _objectDst
 * @returns {object} the final object
 */
function mergeAllObjects(_objectDst, _arraySrc) {
    _arraySrc.forEach((_objectSrc) => {
        deepMerge(_objectDst, _objectSrc);
    });

    return _objectDst;
}

/**
 * @param {object} _objectToBeResolved Object where to merge all object in arrays
 * @returns {object} The final object with all merged "allOf"
 */
function resolveAllOf(_objectToBeResolved) {
    if (typeof _objectToBeResolved === "object") {
        // Go deeper
        Object.keys(_objectToBeResolved).forEach((_key) => resolveAllOf(_objectToBeResolved[_key]));

        Object.keys(_objectToBeResolved)
            .filter((_key) => _key === "allOf")             // Only allOf
            .filter((_key) => Array.isArray(_objectToBeResolved[_key])) // Only arrays
            .forEach((_key) => {
                mergeAllObjects(_objectToBeResolved, _objectToBeResolved[_key]);    // Merge
                delete _objectToBeResolved[_key];                       // Clean
            });
    }

    return _objectToBeResolved;
}

/**
 * @param {string} _path path of json to resolve
 * @param {object} _options options for resolver
 * @param {object} _options.refOptions options for ref resolver
 * @return {promise<object>} promise on json object
 */
function resolve(_path, _options = {}) {
    const refResolver = resolveRefsAt(_path, _options.refOptions);

    return refResolver.then((_refResolved) => resolveAllOf(_refResolved.resolved));
}

module.exports = {resolve};
