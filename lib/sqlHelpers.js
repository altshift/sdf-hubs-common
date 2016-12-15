"use strict";

const fs = require("fs");
const path = require("path");
const pgClient = require("./pgClient");

const sqlFileCache = {};
let connectionConfig, sqlPath;

/**
 * @param {string} $sqlQuery the string of the request, may use prepared statement by including "$1 $2" string
 * @param {object} $preparedValues table of the values supposed to replace the "$" values in the statement
 * @returns {promise} Promise returning the query object
 */
function pSqlRequestQuery($sqlQuery, $preparedValues) {
    let promise;

    if ($sqlQuery) {
        promise = pgClient(connectionConfig).then(($$client) => {
            const query = $$client.query($sqlQuery, $preparedValues);

            // Return an object because query is also a promise and will be resolved
            // but here we want the query object itself
            return Promise.resolve({client: $$client, query});
        });
    } else {
        promise = Promise.reject(new Error("non existing query"));
    }

    return promise;
}

/**
 * @param {string} $sqlQuery the string of the request, may use prepared statement by including "$1 $2" string
 * @param {object} $preparedValues table of the values supposed to replace the "$" values in the statement
 * @returns {promise} Promise returning the rows
 */
function pSqlRequest($sqlQuery, $preparedValues) {
    return pSqlRequestQuery($sqlQuery, $preparedValues).then(({query}) => {
        return query.then(({rows}) => rows);
    });
}

/**
 * Set path of sql files
 * @param {string} _path The path where the sql files are
 * @returns {void}
 */
function sqlSetPath(_path) {
    sqlPath = _path;
}

/**
 * Set path of sql files
 * @param {string} _path The path where the sql files are
 * @returns {void}
 */
function sqlSetConnectionConfig(_connectionConfig) {
    connectionConfig = _connectionConfig;
}

/**
 * Load a sql from a file, return the sql as a string
 * @param {string} _filename Name of the file to load
 * @param {object} _values value to replace in the sql file template is "{{attname}}"
 * @returns {string} the sql request
 */
function sqlLoad(_filename, _values = {}) {
    let sql, attName, regExp;

    sql = sqlFileCache[_filename];
    if (!sql) {
        const filePath = path.join(sqlPath, `${_filename}.sql`);

        sql = fs.readFileSync(filePath, {encoding: "utf8"});
    }

    for (attName in _values) {
        regExp = new RegExp(`{{${attName}}}`, "g");
        sql = sql.replace(regExp, _values[attName]);
    }

    sql = sql.replace(/{{[^}]*}}/g, "");

    return sql;
}

/**
 * Execute file and return sql promise
 *
 * @param {any} _filename Name of the file to execute
 * @param {any} _preparedValues Values from user/db to pass to the sql request
 * @param {any} _namedValues value to replace in the sql file
 * @returns {promise} The promise on the sql request
 */
function pSqlExecuteFile(_filename, _preparedValues, _namedValues) {
    const sql = sqlLoad(_filename, _namedValues);

    return pSqlRequest(sql, _preparedValues);
}

module.exports = {
    pSqlExecuteFile,
    pSqlRequest,
    pSqlRequestQuery,
    sqlLoad,
    sqlSetConnectionConfig,
    sqlSetPath
};

