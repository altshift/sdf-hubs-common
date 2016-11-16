"use strict";

const bcrypt = require("bcrypt");

/**
 * Hash a password for storage
 *
 * @param {any} _password the password to hash
 * @returns {promise<string>} A promise returning the hashed password
 */
function hashPassword(_password) {
    return new Promise((_resolve, _reject) => {
        const passwordPassCount = 8;

        bcrypt.hash(_password, passwordPassCount, (_error, _hash) => {
            if (_error) {
                return _reject(_error);
            }

            return _resolve(_hash);
        });
    });
}

module.exports = {hashPassword};
