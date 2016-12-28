"use strict";

/**
 * Set in object _dest at _path the given _value
 * Transform a 1 depth object to a deeper object for key that
 * contain a dot ex:"{'a.b': 2, 'a.d': 5} => {a: {b: 2, d: '5'}}"
 *
 * @param {object} _dest object, container of final value
 * @param {array} _path array of string representing the path of the given value
 * @param {any} _value final value to put deeper in _dest, at end of _path
 * @returns {void}
 */
function deepifyValue(_dest, _path, _value) {
    const attName = _path[0];

    if (_path.length === 1) {
        // Transform "$null" string values into real null value
        // we need that because the client is not able to send real null values
        if (_value === "$null") {
            _dest[attName] = null;
        } else {
            _dest[attName] = _value;
        }
    } else {
        if (!_dest[attName]) {
            _dest[attName] = {};
        }
        _path.shift();
        deepifyValue(_dest[attName], _path, _value);
    }
}

/**
 * Transform an object with keys like "{'where.id': 22}" to "{where: {id: 22}}"
 * @param {object} _shallowObject Object to deepify
 * @returns {object} _shallowObject deepified
 */
function deepifyObject(_shallowObject) {
    const deepObject = {};

    Object.keys(_shallowObject)
        .filter((_key) => _shallowObject[_key] !== undefined)
        .forEach((_key) => {
            const shallowValue = _shallowObject[_key];
            const path = _key.split(".");

            deepifyValue(deepObject, path, shallowValue);
        });

    return deepObject;
}

module.exports = {deepifyObject};
