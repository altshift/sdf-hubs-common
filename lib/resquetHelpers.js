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
function deepifyValue(_dest, _path, ) {
    const attName = _path[0];

    if (_path.length === 1) {
        _dest[attName] = _value;
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
    let attributeKey = null;

    for (attributeKey in _shallowObject) {
        if (_shallowObject.hasOwnProperty(attributeKey)) {
            const shallowValue = _shallowObject[attributeKey];

            if (shallowValue !== undefined) {
                const path = attributeKey.split(".");

                deepifyValue(deepObject, path, shallowValue);
            }
        }
    }

    return deepObject;
}


module.exports = {deepifyObject};
